import { describe, expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  buildFireflyPreset,
  fireflyPresetAvailability,
} from '../../../src/tools/action-planner/model/presets'
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
import {
  countdownParticipantId,
  effectiveSpeed,
  FULL_AG,
} from '../../../src/tools/action-planner/engine/queue'
import type { EventAnchor, SimulationState } from '../../../src/tools/action-planner/engine/types'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const start: EventAnchor = { kind: 'start' }
const target = (id: string) => ({ kind: 'participants' as const, participantIds: [id] })
const input = { spd: 60, countdownName: en.planner.firefly.countdownName }
function fixture(position = 1): PlannerDocument {
  const document = emptyDocument()
  const ids = ['a']
  ids.splice(position, 0, 'f')
  document.plan.actors = ids.map((id, position) => ({
    id,
    kind: 'actor',
    name: 'User chosen name',
    camp: 'ally',
    position,
    baseSpeed: 80,
    panelSpeed: id === 'f' ? 100 : 150,
  }))
  document.metadata.characterIds = { f: '1310' }
  document.plan.maxNodes = 20
  return document
}
function planner(document = fixture()) {
  const p = useActionPlanner(document.plan, document.metadata, document.name)
  p.edit()
  return p
}
function afterStart(p: ReturnType<typeof planner>) {
  return applyOperations(createInitialState(p.plan.value), operationsAt(p.plan.value, start), start)
    .state
}

describe('Firefly ordinary-operation batch preset', () => {
  it.each([
    [0, 60, zh.planner.firefly.countdownName],
    [1, 37.5, en.planner.firefly.countdownName],
  ] as const)(
    'resolves renamed Firefly at position %s and appends two operations',
    (position, spd, countdownName) => {
      const document = fixture(position)
      document.plan.events = [
        {
          anchor: start,
          operations: [{ id: 'existing', type: 'delay', target: target('a'), percent: 10 }],
        },
      ]
      document.metadata.customNames = { existing: 'Keep this name' }
      const p = planner(document)
      expect(p.submitFirefly({ spd, countdownName })).toBe(true)
      const operations = operationsAt(p.plan.value, start)
      expect(operations[0]).toEqual(document.plan.events[0]!.operations[0])
      expect(operations.slice(1)).toEqual([
        {
          id: expect.any(String),
          type: 'addSpeedModifier',
          target: target('f'),
          mode: 'flat',
          amount: spd,
          duration: { kind: 'countdown', name: countdownName, speed: 70 },
        },
        { id: expect.any(String), type: 'advance', target: target('f'), percent: 100 },
      ])
      expect(new Set(operations.map((op) => op.id)).size).toBe(3)
      expect(p.plan.value.events).toHaveLength(1)
      expect(p.document.value.metadata).toEqual(document.metadata)
      expect(document.plan.events[0]!.operations).toHaveLength(1)
      expect(p.result.value.diagnostics).toEqual([])
    },
  )

  it('subtracts 10000 AG rather than forcing an immediate action after a delay', () => {
    const document = fixture()
    document.plan.events = [
      {
        anchor: start,
        operations: [{ id: 'delay', type: 'delay', target: target('f'), percent: 50 }],
      },
    ]
    const p = planner(document)
    expect(p.submitFirefly(input)).toBe(true)
    const state = afterStart(p)
    expect(state.participants.find((p) => p.id === 'f')!.remainingAG).toBe(5000)
    const action = p.result.value.records[0]!
    expect(action).toMatchObject({ id: 'f', elapsedAV: 5000 / 160 })
    expect(action.actionChanges).toContainEqual(
      expect.objectContaining({
        type: 'advance',
        beforeAG: 15000,
        afterAG: 5000,
        effectiveSpeed: 160,
      }),
    )
    expect(action.actionChanges.some((change) => change.type === 'immediatelyAct')).toBe(false)
  })

  it('creates one independent countdown and expires only its linked speed modifier', () => {
    const document = fixture()
    document.plan.events = [
      {
        anchor: start,
        operations: [
          {
            id: 'other-speed',
            type: 'addSpeedModifier',
            target: target('f'),
            mode: 'flat',
            amount: 20,
            duration: { kind: 'turns', turns: null },
          },
        ],
      },
    ]
    const p = planner(document)
    expect(p.submitFirefly(input)).toBe(true)
    const speedId = operationsAt(p.plan.value, start)[1]!.id
    const countdownId = countdownParticipantId(speedId)
    const state = afterStart(p)
    const countdowns = state.participants.filter((p) => p.kind === 'scheduledEvent')
    expect(countdowns).toHaveLength(1)
    expect(countdowns[0]).toMatchObject({ id: countdownId, speed: 70, remainingAG: FULL_AG })
    const firefly = state.participants.find((p) => p.id === 'f')!
    expect(effectiveSpeed(firefly, state)).toBe(180)
    expect(firefly.modifiers).toContainEqual(
      expect.objectContaining({
        operationId: speedId,
        lifetime: { kind: 'countdown', participantId: countdownId },
      }),
    )
    const triggered = p.result.value.records.find((r) => r.kind === 'scheduledEvent')!
    expect(triggered).toMatchObject({ id: countdownId, elapsedAV: FULL_AG / 70 })
    const expired = triggered.beforeEffects.participants.find((p) => p.id === 'f')!
    expect(expired.modifiers.map((modifier) => modifier.operationId)).toEqual(['other-speed'])
    expect(effectiveSpeed(expired, triggered.beforeEffects)).toBe(120)
  })

  it.each([undefined, -1, NaN, Infinity, -Infinity])(
    'rejects invalid speed %s before allocating IDs',
    (spd) => {
      const document = fixture()
      let allocations = 0
      const built = buildFireflyPreset(
        document,
        start,
        'postAction',
        createInitialState(document.plan),
        { ...input, spd },
        () => `id-${++allocations}`,
      )
      expect(built).toEqual({ invalid: ['spd'], operationIds: [] })
      expect(allocations).toBe(0)
      const p = planner(document)
      const before = p.document.value
      expect(p.submitFirefly({ ...input, spd })).toBe(false)
      expect(p.document.value).toBe(before)
    },
  )

  it('accepts zero speed and rejects an empty countdown name before allocating IDs', () => {
    const p = planner()
    expect(p.submitFirefly({ ...input, spd: 0 })).toBe(true)
    const state = afterStart(p)
    expect(
      effectiveSpeed(
        state.participants.find((p) => p.id === 'f')!,
        state,
      ),
    ).toBe(100)
    let allocations = 0
    expect(
      buildFireflyPreset(
        p.document.value,
        start,
        'postAction',
        state,
        { ...input, countdownName: ' ' },
        () => `id-${++allocations}`,
      ).invalid,
    ).toEqual(['form'])
    expect(allocations).toBe(0)
  })

  it('rejects missing, ambiguous, departed, removed and unavailable contexts without IDs', () => {
    const document = fixture()
    const state = createInitialState(document.plan)
    let allocations = 0
    const check = (doc: PlannerDocument, preview: SimulationState | undefined, issue: string) => {
      expect(
        buildFireflyPreset(doc, start, 'postAction', preview, input, () => `id-${++allocations}`),
      ).toEqual({ invalid: [`firefly:${issue}`], operationIds: [] })
    }
    check({ ...document, metadata: { customNames: {}, characterIds: {} } }, state, 'missing')
    check(
      { ...document, metadata: { customNames: {}, characterIds: { f: '1310', a: '1310' } } },
      state,
      'ambiguous',
    )
    const departed = applyOperations(
      state,
      [{ id: 'leave', type: 'depart', target: target('f') }],
      start,
    ).state
    check(document, departed, 'departed')
    check(
      document,
      { ...state, participants: state.participants.filter((p) => p.id !== 'f') },
      'unavailable',
    )
    check(document, undefined, 'context')
    expect(allocations).toBe(0)
    expect(fireflyPresetAvailability(document, undefined).issue).toBe('context')
  })

  it('uses the insertion preview for departure, removal and unreachable anchors', () => {
    const document = fixture()
    document.plan.events = [
      { anchor: start, operations: [{ id: 'leave', type: 'depart', target: target('f') }] },
    ]
    const p = planner(document)
    const before = p.document.value
    expect(p.result.value.participants.some((p) => p.id === 'f')).toBe(true)
    expect(p.fireflyPresetIssue.value).toBe('departed')
    expect(p.submitFirefly(input)).toBe(false)
    expect(p.document.value).toBe(before)

    const limited = fixture()
    limited.plan.actors.find((a) => a.id === 'f')!.actionLimit = 1
    const q = planner(limited)
    q.select({ kind: 'action', participantId: 'a', turn: 2 })
    q.edit()
    expect(q.fireflyPresetIssue.value).toBe('unavailable')
    const previous = q.document.value
    expect(q.submitFirefly(input)).toBe(false)
    expect(q.document.value).toBe(previous)
    q.select({ kind: 'trigger', participantId: 'orphan' })
    q.edit()
    expect(q.fireflyPresetIssue.value).toBe('context')
    expect(q.submitFirefly(input)).toBe(false)
    expect(q.document.value).toBe(previous)
  })

  it('rejects own preAction and appends at the postAction tail without changing earlier operations', () => {
    const document = fixture()
    const anchor: EventAnchor = { kind: 'action', participantId: 'f', turn: 1 }
    document.plan.events = [
      {
        anchor,
        operations: [
          { id: 'before', type: 'advance', target: target('a'), percent: 0, phase: 'preAction' },
          { id: 'after', type: 'delay', target: target('a'), percent: 10, phase: 'postAction' },
        ],
      },
    ]
    const p = planner(document)
    p.select(anchor)
    p.edit()
    p.draft.value!.phase = 'preAction'
    const before = p.document.value
    const result = p.result.value
    expect(p.fireflyPresetIssue.value).toBe('activeTarget')
    expect(p.submitFirefly(input)).toBe(false)
    expect(p.invalid.value).toEqual(['firefly:activeTarget'])
    expect(p.document.value).toBe(before)
    expect(p.result.value).toBe(result)
    p.draft.value!.phase = 'postAction'
    expect(p.fireflyPresetIssue.value).toBeUndefined()
    expect(p.submitFirefly(input)).toBe(true)
    const operations = operationsAt(p.plan.value, anchor)
    expect(operations.slice(0, 2)).toEqual(document.plan.events[0]!.operations)
    expect(operations.slice(2).map((op) => op.phase)).toEqual(['postAction', 'postAction'])
    expect(p.result.value.diagnostics).toEqual([])
    const index = p.result.value.records.findIndex((r) => r.kind === 'actor' && r.id === 'f')
    expect(p.result.value.records[index + 1]).toMatchObject({ id: 'f', deltaAV: 0 })
  })

  it('publishes and persists once, preserving Version 3 round trips and atomic failures', () => {
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
    scope.run(() => watch(p.document, (document) => persistence.save(document), { flush: 'sync' }))
    const before = p.document.value
    const result = p.result.value
    expect(p.submitFirefly({ ...input, countdownName: 'x'.repeat(300) })).toBe(false)
    expect(p.document.value).toBe(before)
    expect(p.result.value).toBe(result)
    expect(storage.writes).toBe(0)
    expect(p.submitFirefly(input)).toBe(true)
    expect(storage.writes).toBe(1)
    expect(JSON.parse(storage.raw).version).toBe(3)
    const restored = createPlannerPersistence(() => storage).initialize().document
    expect(restored).toEqual(p.document.value)
    expect(parsePlannerDocument(serializePlannerDocument(restored)).document).toEqual(restored)
    expect(simulatePlan(restored.plan)).toEqual(p.result.value)
    scope.stop()

    const broken = fixture()
    broken.plan.events = [
      {
        anchor: { kind: 'action', participantId: 'a', turn: 1 },
        operations: [
          {
            id: 'bad-speed',
            type: 'addSpeedModifier',
            target: target('a'),
            phase: 'postAction',
            mode: 'flat',
            amount: -150,
            duration: { kind: 'turns', turns: null },
          },
        ],
      },
    ]
    const q = planner(broken)
    const previous = q.document.value
    const previousResult = q.result.value
    let writes = 0
    const failureScope = effectScope()
    failureScope.run(() => watch(q.document, () => writes++, { flush: 'sync' }))
    expect(q.submitFirefly(input)).toBe(false)
    expect(q.invalid.value).toEqual(['form'])
    expect(q.document.value).toBe(previous)
    expect(q.result.value).toBe(previousResult)
    expect(writes).toBe(0)
    failureScope.stop()
  })

  it('reserves countdown identities and supports ordinary independent editing and deletion', () => {
    const document = fixture()
    document.plan.events = [
      {
        anchor: { kind: 'trigger', participantId: countdownParticipantId('editor-1') },
        operations: [{ id: 'editor-2', type: 'advance', target: target('a'), percent: 0 }],
      },
    ]
    const p = planner(document)
    expect(p.submitFirefly(input)).toBe(true)
    const [speed, advance] = operationsAt(p.plan.value, start)
    expect([speed!.id, advance!.id].some((id) => ['editor-1', 'editor-2'].includes(id))).toBe(false)
    const countdownId = countdownParticipantId(speed!.id)
    p.edit(speed)
    expect(p.submitFirefly(input)).toBe(false)
    p.draft.value!.amount = 65
    p.draft.value!.customName = 'My speed effect'
    p.draft.value!.duration.countdownName = 'My countdown'
    expect(p.submit()).toBe(true)
    expect(operationsAt(p.plan.value, start)[0]).toMatchObject({ id: speed!.id, amount: 65 })
    expect(afterStart(p).participants).toContainEqual(
      expect.objectContaining({
        id: countdownId,
        name: 'My countdown',
        speed: 70,
      }),
    )
    p.remove(advance!.id)
    expect(operationsAt(p.plan.value, start)).toHaveLength(1)
    expect(p.document.value.metadata.customNames[speed!.id]).toBe('My speed effect')
    p.edit()
    expect(p.submitFirefly(input)).toBe(true)
    p.remove(speed!.id)
    expect(operationsAt(p.plan.value, start).map((op) => op.type)).toEqual([
      'addSpeedModifier',
      'advance',
    ])
    expect(afterStart(p).participants.some((p) => p.id === countdownId)).toBe(false)
    expect(parsePlannerDocument(serializePlannerDocument(p.document.value)).document).toEqual(
      p.document.value,
    )
    p.cancel()
    expect(p.submitFirefly(input)).toBe(false)
  })
})
