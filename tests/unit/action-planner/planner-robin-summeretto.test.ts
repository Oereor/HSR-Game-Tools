import { describe, expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { presets } from '../../../src/tools/action-planner/presets/catalog'
import { compilePreset } from '../../../src/tools/action-planner/presets/resolver'
import { valueResolver } from '../../../src/tools/action-planner/presets/values'
import { messageAt, validatePresets } from '../../../src/tools/action-planner/presets/validation'
import { gameData } from '../../../src/tools/action-planner/data/adapters/game-data'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'
import { operationsAt, type PlannerDocument } from '../../../src/tools/action-planner/model/editor'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import { spawnedParticipantId } from '../../../src/tools/action-planner/engine/queue'
import type { SimulationState } from '../../../src/tools/action-planner/engine/types'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const preset = presets.find((p) => p.id === 'robin-summeretto-fever')!
const start = { kind: 'start' } as const
const translate = (key: string) => messageAt(zh, key) ?? key
const request = { id: preset.id, values: {}, translate }
const target = { kind: 'participants' as const, participantIds: ['r'] }
function fixture(speed = 160): PlannerDocument {
  const document = emptyDocument()
  document.plan.actors = [
    {
      id: 'a',
      position: 0,
      name: 'Teammate',
      kind: 'actor',
      camp: 'ally',
      baseSpeed: 100,
      panelSpeed: 100,
    },
    {
      id: 'r',
      position: 1,
      name: 'Renamed Robin',
      kind: 'actor',
      camp: 'ally',
      baseSpeed: 95,
      panelSpeed: speed,
    },
  ]
  document.metadata.characterIds = { r: '1512' }
  document.plan.maxNodes = 30
  document.plan.maxAV = 500
  return document
}
function compile(
  document = fixture(),
  preview: SimulationState | undefined = createInitialState(document.plan),
) {
  let serial = 0
  return compilePreset(
    preset,
    { document, preview, anchor: start, phase: 'postAction', translate },
    gameData.characters,
    () => `fever-${++serial}`,
  )
}

describe('Robin Summeretto Fever preset', () => {
  it.each([160, 160.123456789])(
    'uses out-of-combat panel SPD %s despite battle modifiers',
    (speed) => {
      const document = fixture(speed)
      document.plan.events = [
        {
          anchor: start,
          operations: [
            {
              id: 'buff',
              type: 'addSpeedModifier',
              target,
              mode: 'flat',
              amount: 70,
              duration: { kind: 'turns', turns: null },
            },
          ],
        },
      ]
      const preview = applyOperations(
        createInitialState(document.plan),
        document.plan.events[0]!.operations,
        start,
      ).state
      const before = structuredClone(document)
      const built = compile(document, preview)
      expect(built.invalid).toEqual([])
      expect(document).toEqual(before)
      const operations = operationsAt(built.document!.plan, start)
      expect(operations.map((op) => op.type)).toEqual([
        'addSpeedModifier',
        'depart',
        'spawnParticipant',
        'spawnParticipant',
      ])
      expect(operations[1]).toMatchObject({ target })
      expect(operations[2]).toMatchObject({
        participant: {
          kind: 'actor',
          camp: 'ally',
          category: 'memosprite',
          name: '晴空乐手',
          baseSpeed: speed * 1.8,
          panelSpeed: speed * 1.8,
          actionLimit: null,
          initialAG: 10000,
        },
      })
      expect(operations[3]).toMatchObject({
        participant: {
          kind: 'actor',
          camp: 'ally',
          category: 'custom',
          name: '气氛值减半节点',
          baseSpeed: 140,
          panelSpeed: 140,
          actionLimit: null,
          initialAG: 10000,
        },
      })
      const result = simulatePlan(built.document!.plan)
      expect(result.diagnostics).toEqual([])
      expect(result.records.some((r) => r.kind !== 'cycleBoundary' && r.id === 'r')).toBe(false)
      const nodeId = spawnedParticipantId(operations[3]!.id)
      const turns = result.records.filter((r) => r.kind !== 'cycleBoundary' && r.id === nodeId)
      expect(turns.length).toBeGreaterThan(2)
      expect(turns[0]!.elapsedAV).toBeCloseTo(10000 / 140)
      expect(turns[1]!.elapsedAV).toBeCloseTo(20000 / 140)
    },
  )

  it('rejects invalid identity/presence/context before allocating IDs', () => {
    const document = fixture()
    const state = createInitialState(document.plan)
    let allocations = 0
    const build = (doc: PlannerDocument, preview?: SimulationState) =>
      compilePreset(
        preset,
        { document: doc, preview, anchor: start, phase: 'postAction', translate },
        gameData.characters,
        () => `unused-${++allocations}`,
      )
    expect(
      build({ ...document, metadata: { customNames: {}, characterIds: {} } }, state).invalid,
    ).toEqual(['missing'])
    expect(
      build(
        { ...document, metadata: { customNames: {}, characterIds: { a: '1512', r: '1512' } } },
        state,
      ).invalid,
    ).toEqual(['ambiguous'])
    expect(
      build(
        document,
        applyOperations(state, [{ id: 'leave', type: 'depart', target }], start).state,
      ).invalid,
    ).toEqual(['departed'])
    expect(
      build(document, { ...state, participants: state.participants.filter((p) => p.id !== 'r') })
        .invalid,
    ).toEqual(['unavailable'])
    expect(build(document).invalid).toEqual(['context'])
    for (const speed of [0, -1, NaN, Infinity]) {
      const invalid = fixture(speed)
      expect(build(invalid, state).invalid).toEqual(['self-stat'])
    }
    expect(allocations).toBe(0)
  })

  it('uses the insertion preview and leaves the committed document untouched on failure', () => {
    const document = fixture()
    document.plan.events = [
      { anchor: start, operations: [{ id: 'leave', type: 'depart', target }] },
    ]
    const p = useActionPlanner(document.plan, document.metadata)
    p.edit()
    const before = p.document.value
    const result = p.result.value
    expect(p.presetIssues.value[preset.id]).toBe('departed')
    expect(p.submitPreset(request)).toBe(false)
    expect(p.document.value).toBe(before)
    expect(p.result.value).toBe(result)
  })

  it.each(['preAction', 'postAction'] as const)(
    'applies at Robin own %s and preserves phase semantics',
    (phase) => {
      const document = fixture()
      const p = useActionPlanner(document.plan, document.metadata)
      p.select({ kind: 'action', participantId: 'r', turn: 1 })
      p.edit()
      p.draft.value!.phase = phase
      expect(p.submitPreset(request)).toBe(true)
      expect(operationsAt(p.plan.value, p.selected.value).map((op) => op.phase)).toEqual([
        phase,
        phase,
        phase,
      ])
      expect(p.result.value.diagnostics).toEqual([])
      expect(
        p.result.value.records.filter((r) => r.kind !== 'cycleBoundary' && r.id === 'r'),
      ).toHaveLength(1)
    },
  )

  it('publishes once, persists plain Version 3 operations, and lets each spawn be edited separately', () => {
    const document = fixture()
    const p = useActionPlanner(document.plan, document.metadata)
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
    p.edit()
    expect(p.submitPreset(request)).toBe(true)
    expect(storage.writes).toBe(1)
    const exported = serializePlannerDocument(p.document.value)
    expect(JSON.parse(exported).version).toBe(3)
    expect(exported).not.toContain('self-stat')
    const restored = createPlannerPersistence(() => storage).initialize().document
    expect(restored).toEqual(p.document.value)
    expect(parsePlannerDocument(exported).document).toEqual(restored)
    expect(simulatePlan(restored.plan)).toEqual(p.result.value)
    const operations = operationsAt(p.plan.value, start)
    const musician = operations[1]!
    const node = structuredClone(operations[2]!)
    p.edit(musician)
    p.draft.value!.participant.name = 'Edited musician'
    p.draft.value!.participant.panelSpeed = 300
    expect(p.submit()).toBe(true)
    expect(operationsAt(p.plan.value, start)[1]).toMatchObject({
      id: musician.id,
      participant: { name: 'Edited musician', panelSpeed: 300, baseSpeed: 288 },
    })
    expect(operationsAt(p.plan.value, start)[2]).toEqual(node)
    const changed = structuredClone(restored)
    changed.plan.actors.find((a) => a.id === 'r')!.panelSpeed = 200
    expect(
      operationsAt(parsePlannerDocument(serializePlannerDocument(changed)).document.plan, start)[1],
    ).toMatchObject({ participant: { panelSpeed: 288, baseSpeed: 288 } })
    scope.stop()
  })

  it('validates contextual expressions without falling back to catalog speed', () => {
    expect(() => validatePresets([preset], [zh, en], gameData)).not.toThrow()
    const value = { type: 'self-stat', stat: 'panelSpeed' } as const
    expect(
      valueResolver(preset, gameData.characters, translate, {}, { panelSpeed: 160 }).resolve(value),
    ).toBe(160)
    expect(() => valueResolver(preset, gameData.characters, translate).resolve(value)).toThrow(
      'self-stat',
    )
    const noSelf = {
      ...preset,
      operations: [
        {
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Context required', speed: value },
        },
      ],
    }
    delete noSelf.characterId
    delete noSelf.selfPresence
    expect(() => validatePresets([noSelf], [zh, en], gameData)).toThrow('self-reference')
    for (const invalid of [
      { type: 'self-stat', stat: 'baseSpeed' },
      { ...value, extra: true },
    ]) {
      const modified = {
        ...preset,
        operations: [
          {
            type: 'spawnParticipant',
            participant: { kind: 'scheduledEvent', name: 'Invalid', speed: invalid },
          },
        ],
      }
      expect(() => validatePresets([modified], [zh, en], gameData)).toThrow()
    }
  })
})
