import { describe, expect, it } from 'vitest'
import { recomputeSkillPointMax } from '../../../src/tools/action-planner/engine/skill-point-max'
import { summarizeSkillPoints } from '../../../src/tools/action-planner/engine/skill-point-summary'
import { validSkillPoints } from '../../../src/tools/action-planner/engine/skill-points'
import { buildSkillPointLedger } from '../../../src/tools/action-planner/model/skill-point-ledger'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import {
  cloneState,
  defaultAhaConfig,
  SimulationError,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import {
  validateOperations,
  validatePlan,
} from '../../../src/tools/action-planner/engine/validation'
import type {
  ConditionalRestoreOperation,
  EffectOperation,
  EventAnchor,
  SimulationPlan,
  SimulationResult,
} from '../../../src/tools/action-planner/engine/types'

const start = { kind: 'start' } as const
const action = { kind: 'action', participantId: 'a', turn: 1 } as const
function plan(initial = 3): SimulationPlan {
  return {
    aha: defaultAhaConfig(),
    cycleMode: 'none',
    maxNodes: 3,
    maxAV: 600,
    actors: [
      {
        id: 'a',
        kind: 'actor',
        camp: 'ally',
        position: 0,
        name: 'Synthetic actor',
        baseSpeed: 100,
        panelSpeed: 100,
      },
    ],
    events: [],
    skillPoints: { enabled: true, initial, max: 5 },
  }
}
const restore = (amount = 1, storeOverflow?: boolean, id = 'restore'): EffectOperation => ({
  id,
  type: 'restoreSkillPoints',
  amount,
  source: 'Synthetic restoration',
  ...(storeOverflow === undefined ? {} : { storeOverflow }),
})
const refund = (outcome: 'proc' | 'no-proc' = 'proc'): ConditionalRestoreOperation => ({
  id: 'refund',
  type: 'conditionalRestore',
  phase: 'postAction',
  amount: 1,
  chance: 0.5,
  cooldownTurns: 1,
  outcome,
  sourceParticipantId: 'a',
  source: 'Synthetic refund',
})

describe('Skill Point foundation: state and explicit operations only', () => {
  it.each([
    { before: 7, after: 5, loss: 2 },
    { before: 4, after: 4, loss: 0 },
    { before: 0, after: 0, loss: 0 },
    { before: null, after: null, loss: null },
  ])('distinguishes known and unknown cap loss: %j', ({ before, after, loss }) => {
    const p = plan(7)
    p.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    const state = createInitialState(p)
    state.skillPoints!.current = before
    state.skillPoints!.stored = 4
    const initial = cloneState(state)
    state.participants[0]!.departed = true
    const change = recomputeSkillPointMax(state, 'presence')!
    expect(change).toMatchObject({ beforeMax: 7, afterMax: 5, before, after, loss })
    expect(state.skillPoints).toMatchObject({ current: after, stored: 4, max: 5 })
    expect(initial.skillPoints).toMatchObject({ current: before, stored: 4, max: 7 })
    const result: SimulationResult = {
      records: [],
      snapshots: [],
      participants: [],
      diagnostics: [],
      stopReason: 'nodes',
      startState: initial,
      startMaxChanges: [change],
    }
    result.skillPointsSummary = summarizeSkillPoints(result, state.skillPoints!)
    expect(result.skillPointsSummary.capLoss).toBe(loss)
    expect(buildSkillPointLedger(result, 'none')[0]!.capLoss).toBe(loss)
  })
  it('preserves unknown balance and stored 4 when departure automatically reduces the cap', () => {
    const p = plan(7)
    p.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    const input = createInitialState(p)
    input.skillPoints!.current = null
    input.skillPoints!.stored = 4
    const applied = applyOperations(
      input,
      [
        {
          id: 'depart-source',
          type: 'depart',
          target: { kind: 'participants', participantIds: ['a'] },
        },
      ],
      start,
    )
    const departed = applied.state
    expect(departed.participants[0]!.departed).toBe(true)
    const change = applied.maxChanges![0]!
    expect(change).toMatchObject({
      beforeMax: 7,
      afterMax: 5,
      before: null,
      after: null,
      loss: null,
    })
    expect(departed.skillPoints).toMatchObject({ current: null, stored: 4, max: 5 })
    expect(input.skillPoints).toMatchObject({ current: null, stored: 4, max: 7 })
    expect(input.participants[0]!.departed).toBe(false)
  })
  it.each([
    0.5,
    -0.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
    Infinity,
    -Infinity,
    NaN,
  ])('rejects invalid individual modifiers even when paired to cancel: %s', (amount) => {
    expect(
      validSkillPoints({ initial: 0, max: 0, maxModifiers: [{ amount }, { amount: -amount }] }),
    ).toBe(false)
  })
  it('accepts nonzero safe-integer modifiers individually, including the safe boundary', () => {
    expect(
      validSkillPoints({
        initial: 0,
        max: 0,
        maxModifiers: [{ amount: Number.MAX_SAFE_INTEGER }, { amount: -Number.MAX_SAFE_INTEGER }],
      }),
    ).toBe(true)
  })
  it('defaults to no SP state and initializes enabled state with independent configuration', () => {
    const p = plan()
    delete p.skillPoints
    expect(createInitialState(p)).not.toHaveProperty('skillPoints')
    p.skillPoints = {}
    expect(createInitialState(p)).not.toHaveProperty('skillPoints')
    p.skillPoints = { enabled: true }
    expect(createInitialState(p).skillPoints).toEqual({
      current: 3,
      max: 5,
      baseMax: 5,
      stored: 0,
      storedMax: 10,
      onInsufficient: 'stop',
      maxModifiers: [],
      conditionalCooldowns: new Map(),
    })
    p.skillPoints.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    const state = createInitialState(p)
    expect(state.skillPoints?.max).toBe(7)
    state.skillPoints!.maxModifiers[0]!.amount = 9
    expect(p.skillPoints.maxModifiers[0]!.amount).toBe(2)
  })
  it('clones unknown/zero, cooldown Maps and modifier arrays without sharing historical state', () => {
    const p = plan(0)
    p.skillPoints!.maxModifiers = [{ amount: 2 }]
    const original = createInitialState(p)
    original.skillPoints!.conditionalCooldowns.set('a', 3)
    const copied = cloneState(original)
    expect(copied.skillPoints?.current).toBe(0)
    expect(copied.skillPoints).not.toBe(original.skillPoints)
    expect(copied.skillPoints!.maxModifiers).not.toBe(original.skillPoints!.maxModifiers)
    expect(copied.skillPoints!.maxModifiers[0]).not.toBe(original.skillPoints!.maxModifiers[0])
    expect(copied.skillPoints!.conditionalCooldowns).not.toBe(
      original.skillPoints!.conditionalCooldowns,
    )
    copied.skillPoints!.current = null
    copied.skillPoints!.stored = null
    copied.skillPoints!.maxModifiers[0]!.amount = 4
    copied.skillPoints!.conditionalCooldowns.set('a', 9)
    expect(original.skillPoints).toMatchObject({
      current: 0,
      stored: 0,
      maxModifiers: [{ amount: 2 }],
    })
    expect(original.skillPoints!.conditionalCooldowns.get('a')).toBe(3)
    expect(cloneState(copied).skillPoints).toMatchObject({ current: null, stored: null })
  })
  it.each([
    { initial: -1 },
    { initial: 6 },
    { max: 0 },
    { max: 1.5 },
    { initial: null },
    { storedMax: -1 },
    { onInsufficient: 'other' },
    { extra: true },
    { maxModifiers: [{ amount: 0 }] },
    { maxModifiers: [{ amount: -6 }] },
    { maxModifiers: [{ amount: 2, sourceParticipantId: 'missing' }] },
  ])('rejects invalid SP configuration %j', (fields) => {
    const p = plan()
    Object.assign(p.skillPoints!, fields)
    expect(validatePlan(p).some((d) => d.severity === 'error')).toBe(true)
    expect(() => createInitialState(p)).toThrow(SimulationError)
  })
  it('requires cap modifier sources to be initial allies, while accepting zero caps/initials', () => {
    const p = plan(0)
    p.skillPoints!.max = 0
    expect(createInitialState(p).skillPoints).toMatchObject({ current: 0, max: 0 })
    p.actors[0]!.camp = 'enemy'
    p.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    expect(validatePlan(p)).not.toEqual([])
    p.actors[0]!.camp = 'ally'
    p.skillPoints!.initial = 2
    expect(createInitialState(p).skillPoints).toMatchObject({ current: 2, max: 2 })
    p.skillPoints!.initial = 3
    expect(validatePlan(p)).not.toEqual([])
  })
  it('restores at battle start and leaves the input state untouched', () => {
    const input = createInitialState(plan())
    const result = applyOperations(input, [restore(2)], start)
    expect(result.state.skillPoints?.current).toBe(5)
    expect(result.skillPointEvents?.[0]).toMatchObject({
      before: 3,
      after: 5,
      restored: 2,
      overflow: 0,
      stored: 0,
      wasted: 0,
    })
    expect(input.skillPoints?.current).toBe(3)
  })
  it('distinguishes restoration from zero and restoration with an unknown balance', () => {
    const zero = createInitialState(plan(0))
    expect(applyOperations(zero, [restore()], start).skillPointEvents?.[0]).toMatchObject({
      before: 0,
      after: 1,
      restored: 1,
    })
    const unknown = cloneState(zero)
    unknown.skillPoints!.current = null
    expect(applyOperations(unknown, [restore()], start).skillPointEvents?.[0]).toMatchObject({
      before: null,
      after: null,
      restored: null,
      overflow: null,
      stored: 0,
      wasted: null,
      storedAfter: 0,
    })
    expect(applyOperations(unknown, [restore(6, true)], start).state.skillPoints).toMatchObject({
      current: null,
      stored: null,
    })
    expect(unknown.skillPoints).toMatchObject({ current: null, stored: 0 })
  })
  it.each([
    { initial: 0, current: 5, stored: 1 },
    { initial: 5, current: 5, stored: 6 },
  ])('records capped overflow and deposits it in storage: %j', ({ initial, current, stored }) => {
    const result = applyOperations(createInitialState(plan(initial)), [restore(6, true)], start)
    expect(result.state.skillPoints).toMatchObject({ current, stored })
    expect(result.skillPointEvents?.[0]).toMatchObject({
      restored: current - initial,
      overflow: stored,
      stored,
      wasted: 0,
      storedAfter: stored,
    })
    expect(result.diagnostics[0]).toMatchObject({ code: 'sp-overflow', operationId: 'restore' })
  })
  it('caps repeated deposits, recording waste instead of silently losing it', () => {
    const result = applyOperations(
      createInitialState(plan(5)),
      [restore(6, true, 'first'), restore(6, true, 'second')],
      start,
    )
    expect(
      result.skillPointEvents?.map((r) => [r.operationId, r.stored, r.wasted, r.storedAfter]),
    ).toEqual([
      ['first', 6, 0, 6],
      ['second', 4, 2, 10],
    ])
    expect(result.state.skillPoints?.stored).toBe(10)
  })
  it.each([undefined, false])('discards overflow without storage opt-in (%s)', (flag) => {
    expect(
      applyOperations(createInitialState(plan(5)), [restore(6, flag)], start).skillPointEvents?.[0],
    ).toMatchObject({ restored: 0, overflow: 6, stored: 0, wasted: 6, storedAfter: 0 })
  })
  it('honors zero storage capacity, including with an unknown balance', () => {
    const p = plan(5)
    p.skillPoints!.storedMax = 0
    const input = createInitialState(p)
    expect(applyOperations(input, [restore(6, true)], start).skillPointEvents?.[0]).toMatchObject({
      stored: 0,
      wasted: 6,
      storedAfter: 0,
    })
    input.skillPoints!.current = null
    expect(applyOperations(input, [restore(6, true)], start).state.skillPoints?.stored).toBe(0)
  })
  it.each(['summon', 'memosprite'] as const)(
    'allows explicit restoration and conditional refunds on %s actions',
    (category) => {
      const p = plan(3)
      p.actors[0]!.category = category
      for (const phase of ['preAction', 'postAction'] as const) {
        const operation = { ...restore(), phase }
        p.events = [{ anchor: action, operations: [operation] }]
        expect(validatePlan(p)).toEqual([])
        const input = createInitialState(p)
        expect(applyOperations(input, [operation], action).state.skillPoints?.current).toBe(4)
        expect(input.skillPoints?.current).toBe(3)
      }
      p.events = [{ anchor: action, operations: [refund()] }]
      expect(validatePlan(p)).toEqual([])
      const input = createInitialState(p)
      const actor = input.participants[0]!
      if (actor.kind !== 'actor') throw new Error('Expected actor')
      actor.turns = 1
      expect(applyOperations(input, [refund()], action).conditionalRestores?.[0]).toMatchObject({
        status: 'proc',
        before: 3,
        after: 4,
        availableFromTurn: 3,
      })
      expect(input.skillPoints!.conditionalCooldowns.size).toBe(0)
    },
  )
  it('validates explicitly restored dynamic summons without changing ordinary target eligibility', () => {
    const p = plan()
    const id = spawnedParticipantId('spawn')
    const summon = { ...p.actors[0]!, category: 'memosprite' as const }
    p.events = [
      {
        anchor: start,
        operations: [{ id: 'spawn', type: 'spawnParticipant', participant: summon }],
      },
      {
        anchor: { ...action, participantId: id },
        operations: [{ ...restore(), phase: 'postAction' }],
      },
    ]
    expect(validatePlan(p)).toEqual([])
    const spawned = applyOperations(createInitialState(p), p.events[0]!.operations, start).state
    const result = applyOperations(spawned, p.events[1]!.operations, p.events[1]!.anchor)
    expect(result.state.skillPoints?.current).toBe(4)
    expect(spawned.skillPoints?.current).toBe(3)
  })
  it.each([
    { amount: 0 },
    { amount: -1 },
    { amount: 1.5 },
    { amount: Infinity },
    { source: '' },
    { storeOverflow: 'yes' },
    { target: { kind: 'allies' } },
  ])('rejects invalid explicit restoration fields %j', (fields) => {
    const operation = Object.assign(restore(), fields)
    expect(validateOperations([operation], start)).not.toEqual([])
    expect(() => applyOperations(createInitialState(plan()), [operation], start)).toThrow(
      SimulationError,
    )
  })
  it.each([
    { kind: 'trigger', participantId: 'a' },
    { kind: 'cycleBoundary', ordinal: 1 },
  ] as EventAnchor[])('rejects restoration on non-action event anchors %j', (anchor) => {
    expect(validateOperations([restore()], anchor)).not.toEqual([])
  })
  it('rejects enemy and missing action sources in static validation and runtime', () => {
    const p = plan()
    p.actors[0]!.camp = 'enemy'
    const operation = { ...restore(), phase: 'postAction' as const }
    const input = createInitialState(p)
    p.events = [{ anchor: action, operations: [operation] }]
    expect(validatePlan(p)).not.toEqual([])
    expect(() => applyOperations(input, [operation], action)).toThrow(SimulationError)
    expect(() =>
      applyOperations(input, [operation], { ...action, participantId: 'missing' }),
    ).toThrow(SimulationError)
  })
  it('requires skill context for conditional refunds from a normal allied character', () => {
    const p = plan()
    p.actors[0]!.category = 'character'
    const input = createInitialState(p)
    const actor = input.participants[0]!
    if (actor.kind !== 'actor') throw new Error('Expected actor')
    actor.turns = 1
    const before = cloneState(input)
    expect(() => applyOperations(input, [refund()], action)).toThrow(SimulationError)
    expect(input).toEqual(before)
    expect(
      applyOperations(input, [refund()], action, { skill: { kind: 'skill' } })
        .conditionalRestores?.[0],
    ).toMatchObject({ status: 'proc', before: 3, after: 4 })
    expect(input).toEqual(before)
  })
  it('uses the selected conditional outcome and preserves repaired unknown/cooldown semantics', () => {
    const input = createInitialState(plan())
    input.skillPoints!.current = null
    const source = input.participants[0]!
    if (source.kind !== 'actor') throw new Error('Expected actor')
    source.turns = 1
    const first = applyOperations(input, [refund()], action, { skill: { kind: 'skill' } })
    expect(first.conditionalRestores?.[0]).toMatchObject({
      status: 'proc',
      restored: null,
      overflow: null,
      stored: null,
      wasted: null,
      availableFromTurn: 3,
    })
    expect(first.state.skillPoints?.current).toBeNull()
    expect(input.skillPoints!.conditionalCooldowns.size).toBe(0)
    const coolingSource = first.state.participants[0]!
    if (coolingSource.kind !== 'actor') throw new Error('Expected actor')
    coolingSource.turns = 2
    const second = applyOperations(
      first.state,
      [refund('no-proc')],
      { ...action, turn: 2 },
      { skill: { kind: 'skill' } },
    )
    expect(second.conditionalRestores?.[0]).toMatchObject({
      status: 'cooldown',
      restored: 0,
      availableFromTurn: 3,
    })
    const availableSource = second.state.participants[0]!
    if (availableSource.kind !== 'actor') throw new Error('Expected actor')
    availableSource.turns = 3
    const third = applyOperations(
      second.state,
      [refund('no-proc')],
      { ...action, turn: 3 },
      { skill: { kind: 'skill' } },
    )
    expect(third.conditionalRestores?.[0]).toMatchObject({ status: 'no-proc', restored: 0 })
    expect(third.conditionalRestores?.[0]).not.toHaveProperty('availableFromTurn')
    expect(third.state.skillPoints!.conditionalCooldowns.get('a')).toBe(3)
  })
  it('preserves list order, skips invalid ordinary targets, and cannot mutate input on a failed operation', () => {
    const input = createInitialState(plan())
    const missing: EffectOperation = {
      id: 'missing',
      type: 'advance',
      target: { kind: 'participants', participantIds: ['absent'] },
      percent: 50,
    }
    const result = applyOperations(
      input,
      [restore(1, false, 'first'), missing, restore(1, false, 'last')],
      start,
    )
    expect(result.skillPointEvents?.map((r) => [r.operationId, r.before, r.after])).toEqual([
      ['first', 3, 4],
      ['last', 4, 5],
    ])
    expect(result.diagnostics).toEqual([
      { code: 'missing-target', severity: 'warning', anchor: start, operationId: 'missing' },
    ])
    const before = cloneState(input)
    const invalidSpeed: EffectOperation = {
      id: 'invalid',
      type: 'addSpeedModifier',
      target: { kind: 'allies' },
      mode: 'flat',
      amount: -200,
      duration: { kind: 'turns', turns: null },
    }
    expect(() => applyOperations(input, [restore(6, true), invalidSpeed], start)).toThrow(
      SimulationError,
    )
    expect(input).toEqual(before)
    expect(result.state.participants[0]!.remainingAG).toBe(input.participants[0]!.remainingAG)
  })
  it('ignores resource operations when disabled and keeps upstream simulation output unchanged', () => {
    const p = plan()
    p.skillPoints = { enabled: false }
    const disabled = simulatePlan(p)
    const noConfig = { ...p }
    delete noConfig.skillPoints
    expect(disabled).toEqual(simulatePlan(noConfig))
    const input = createInitialState(p)
    const source = input.participants[0]!
    if (source.kind !== 'actor') throw new Error('Expected actor')
    source.turns = 1
    expect(applyOperations(input, [restore(6, true)], start)).toEqual(
      applyOperations(input, [], start),
    )
    expect(applyOperations(input, [refund()], action, { skill: { kind: 'skill' } })).toEqual(
      applyOperations(input, [], action),
    )
    expect(applyOperations(input, [restore(6, true)], start).state).not.toHaveProperty(
      'skillPoints',
    )
  })
})
