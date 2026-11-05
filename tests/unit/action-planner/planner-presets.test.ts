import { describe, expect, it, vi } from 'vitest'
import { effectScope, watch } from 'vue'
import { createI18n } from 'vue-i18n'
import { presets } from '../../../src/tools/action-planner/presets/catalog'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'
import {
  parsePlannerDocument,
  serializePlannerDocument,
  FILE_LIMITS,
} from '../../../src/tools/action-planner/model/document-file'
import { operationsAt } from '../../../src/tools/action-planner/model/editor'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import { spawnedParticipantId } from '../../../src/tools/action-planner/engine/queue'
import type {
  PresetDefinition,
  PresetRequest,
} from '../../../src/tools/action-planner/presets/types'
import zh from '../../../src/locales/zh-CN.json'
import {
  fixture,
  start,
  target,
  translate,
  syntheticPresets,
  draftPreset,
  returnPreset,
  speedPreset,
  repeatPreset,
} from '../../fixtures/action-planner/presets'

// Keep real catalog loading/validation and add test-owned definitions only in this test module.
vi.mock('../../../src/tools/action-planner/presets/catalog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/tools/action-planner/presets/catalog')>()
  const { syntheticPresets } = await import('../../fixtures/action-planner/presets')
  return { ...actual, presets: [...actual.presets, ...syntheticPresets] }
})
const request = (
  preset: PresetDefinition,
  values: PresetRequest['values'] = {},
): PresetRequest => ({ id: preset.id, values, translate })
function planner(document = fixture()) {
  const p = useActionPlanner(document.plan, document.metadata, document.name)
  p.edit()
  return p
}

describe('preset editor integration with synthetic definitions', () => {
  it('prefills a draft without publishing and permits repairing its active target', () => {
    const p = planner()
    p.select({ kind: 'action', participantId: 'a', turn: 1 })
    p.edit()
    p.draft.value!.phase = 'preAction'
    p.draft.value!.selectedIds = ['a']
    const before = p.document.value
    expect(p.submitPreset(request(draftPreset))).toBe(true)
    expect(p.document.value).toBe(before)
    expect(p.draft.value).toMatchObject({ percent: 35, selectedIds: ['a'] })
    p.draft.value!.selectedIds = ['b']
    expect(p.submit()).toBe(true)
    expect(p.result.value.diagnostics).toEqual([])
  })

  it.each([
    { preset: speedPreset, actor: 'a', issue: 'activeTarget' },
    { preset: returnPreset, actor: 'b', issue: 'activeAlly' },
  ])('checks $preset.id at the selected phase tail', ({ preset, actor, issue }) => {
    const p = planner()
    p.select({ kind: 'action', participantId: actor, turn: 1 })
    p.edit()
    p.draft.value!.phase = 'preAction'
    const before = p.document.value
    expect(p.submitPreset(request(preset))).toBe(false)
    expect(p.invalid.value).toEqual([issue])
    expect(p.document.value).toBe(before)
    p.draft.value!.phase = 'postAction'
    expect(p.submitPreset(request(preset))).toBe(true)
    expect(
      operationsAt(p.plan.value, p.selected.value).every((op) => op.phase === 'postAction'),
    ).toBe(true)
    expect(p.result.value.diagnostics).toEqual([])
  })

  it('publishes and saves a complete batch once, and restores ordinary editable operations', () => {
    const p = planner()
    const storage = {
      raw: serializePlannerDocument(p.document.value),
      writes: 0,
      getItem() {
        return this.raw
      },
      setItem(_key: string, value: string) {
        this.raw = value
        this.writes++
      },
    }
    const persistence = createPlannerPersistence(() => storage)
    persistence.initialize()
    const scope = effectScope()
    scope.run(() => watch(p.document, (doc) => persistence.save(doc), { flush: 'sync' }))
    try {
      const before = p.document.value
      const result = p.result.value
      expect(
        p.submitPreset(
          request(returnPreset, { timerName: 'x'.repeat(FILE_LIMITS.displayName + 1) }),
        ),
      ).toBe(false)
      expect(p.document.value).toBe(before)
      expect(p.result.value).toBe(result)
      expect(storage.writes).toBe(0)
      expect(p.submitPreset(request(returnPreset))).toBe(true)
      expect(storage.writes).toBe(1)
      const restored = createPlannerPersistence(() => storage).initialize().document
      expect(restored).toEqual(p.document.value)
      expect(parsePlannerDocument(storage.raw).document).toEqual(restored)
      expect(simulatePlan(restored.plan)).toEqual(p.result.value)
      expect(storage.raw).not.toMatch(/"(?:onTrigger|user-input|self-stat)"/)
      const spawn = operationsAt(p.plan.value, start).find((op) => op.type === 'spawnParticipant')!
      const trigger = p.plan.value.events.find((event) => event.anchor.kind === 'trigger')!
      expect(trigger.anchor).toEqual({
        kind: 'trigger',
        participantId: spawnedParticipantId(spawn.id),
      })
      expect(trigger.operations.every((op) => op.phase === undefined)).toBe(true)
      p.edit(spawn)
      p.draft.value!.participant.name = 'User clock'
      p.draft.value!.participant.speed = 75
      expect(p.submit()).toBe(true)
      expect(operationsAt(p.plan.value, start).find((op) => op.id === spawn.id)).toMatchObject({
        participant: { name: 'User clock', speed: 75 },
      })
      expect(p.plan.value.events.find((event) => event.anchor.kind === 'trigger')).toEqual(trigger)
    } finally {
      scope.stop()
    }
  })

  it.each(['replay', 'generated-target'] as const)(
    'rejects a whole batch on %s failure without publishing',
    (failure) => {
      const document = fixture()
      if (failure === 'replay') {
        document.plan.events = [
          {
            anchor: { kind: 'action', participantId: 'b', turn: 1 },
            operations: [
              {
                id: 'bad-speed',
                type: 'addSpeedModifier',
                phase: 'postAction',
                target: target('b'),
                mode: 'flat',
                amount: -100,
                duration: { kind: 'turns', turns: null },
              },
            ],
          },
        ]
      } else document.plan.actors[0]!.actionLimit = 1
      const p = planner(document)
      if (failure === 'generated-target') {
        p.select({ kind: 'action', participantId: 'a', turn: 1 })
        p.edit()
      }
      const before = p.document.value
      const result = p.result.value
      let publications = 0
      const stop = watch(p.document, () => publications++, { flush: 'sync' })
      try {
        expect(p.submitPreset(request(returnPreset))).toBe(false)
        expect(p.document.value).toBe(before)
        expect(p.result.value).toBe(result)
        expect(publications).toBe(0)
      } finally {
        stop()
      }
    },
  )

  it('reserves imported and orphan identities and preserves generated anchors outside the budget', () => {
    const document = fixture()
    document.plan.maxNodes = 1
    const first = planner(document)
    expect(first.submitPreset(request(returnPreset))).toBe(true)
    const trigger = first.plan.value.events.find((event) => event.anchor.kind === 'trigger')!
    expect(first.unreached.value).toContainEqual(trigger)
    const restored = parsePlannerDocument(serializePlannerDocument(first.document.value)).document
    restored.plan.maxNodes = 30
    const p = planner(restored)
    expect(p.result.value.diagnostics).toEqual([])
    p.select(trigger.anchor)
    p.edit()
    expect(p.submitPreset(request(returnPreset))).toBe(true)
    const operations = p.plan.value.events.flatMap((event) => event.operations)
    expect(new Set(operations.map((op) => op.id)).size).toBe(operations.length)
    const spawn = operations.find((op) => op.type === 'spawnParticipant')!
    p.select(start)
    p.remove(spawn.id)
    expect(p.unreached.value).toContainEqual(expect.objectContaining({ anchor: trigger.anchor }))
    const orphaned = fixture()
    orphaned.plan.events = [structuredClone(trigger)]
    const q = planner(parsePlannerDocument(serializePlannerDocument(orphaned)).document)
    const reserved = new Set(trigger.operations.map((op) => op.id))
    expect(q.submitPreset(request(returnPreset))).toBe(true)
    const added = operationsAt(q.plan.value, start).filter((op) => !reserved.has(op.id))
    expect(added.length).toBeGreaterThan(0)
    expect(operationsAt(q.plan.value, start).every((op) => !reserved.has(op.id))).toBe(true)
    expect(q.unreached.value).toContainEqual(expect.objectContaining({ anchor: trigger.anchor }))
    expect(
      q.plan.value.events.some(
        (event) =>
          event.anchor.kind === 'trigger' &&
          event.anchor.participantId === spawnedParticipantId(spawn.id),
      ),
    ).toBe(true)
  })

  it.each([160, 160.123456789])(
    'materializes panel SPD %s independently of buffs and schedules repeating actors',
    (panelSpeed) => {
      const document = fixture()
      document.plan.actors[0]!.panelSpeed = panelSpeed
      document.plan.events = [
        {
          anchor: start,
          operations: [
            {
              id: 'buff',
              type: 'addSpeedModifier',
              target: target('a'),
              mode: 'flat',
              amount: 70,
              duration: { kind: 'turns', turns: null },
            },
          ],
        },
      ]
      const p = planner(document)
      expect(p.submitPreset(request(repeatPreset))).toBe(true)
      const spawns = operationsAt(p.plan.value, start).filter(
        (op) => op.type === 'spawnParticipant',
      )
      expect(spawns[0]).toMatchObject({
        participant: { baseSpeed: panelSpeed * 1.8, panelSpeed: panelSpeed * 1.8 },
      })
      const node = spawnedParticipantId(spawns[1]!.id)
      const turns = p.result.value.records.filter(
        (record) => record.kind !== 'cycleBoundary' && record.id === node,
      )
      expect(turns.length).toBeGreaterThan(2)
      expect(turns[0]!.elapsedAV).toBeCloseTo(10000 / 140)
      expect(turns[1]!.elapsedAV).toBeCloseTo(20000 / 140)
      expect(
        p.result.value.records.some(
          (record) => record.kind !== 'cycleBoundary' && record.id === 'a',
        ),
      ).toBe(false)
      const restored = parsePlannerDocument(serializePlannerDocument(p.document.value)).document
      restored.plan.actors[0]!.panelSpeed = 200
      expect(
        operationsAt(restored.plan, start).filter((op) => op.type === 'spawnParticipant'),
      ).toEqual(spawns)
    },
  )
})

describe('production preset catalog wiring', () => {
  // Only the declarations supply identities/defaults. Configuration contents are not expected answers.
  const production = presets.filter(
    (preset) => !syntheticPresets.some((test) => test.id === preset.id),
  )
  const { global: composer } = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: { 'zh-CN': zh },
  })
  it.each(production)('applies $id and simulates the resulting ordinary plan', (preset) => {
    const document = fixture()
    document.metadata.characterIds = preset.characterId ? { a: preset.characterId } : {}
    document.plan.actors.push({
      id: 'enemy',
      position: 0,
      kind: 'actor',
      camp: 'enemy',
      name: 'Test enemy',
      baseSpeed: 100,
      panelSpeed: 100,
    })
    if (preset.selfPresence === 'departed')
      document.plan.events = [
        { anchor: start, operations: [{ id: 'depart', type: 'depart', target: target('a') }] },
      ]
    const p = planner(document)
    expect(
      p.submitPreset({
        id: preset.id,
        values: {},
        translate: (key, params) => (params ? composer.t(key, params) : composer.t(key)),
      }),
    ).toBe(true)
    if (preset.interaction === 'draft') expect(p.submit()).toBe(true)
    expect(p.result.value.diagnostics.filter((issue) => issue.severity === 'error')).toEqual([])
  })
})
