import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  simulatePlan,
  stepSimulation,
} from '../../../src/tools/action-planner/engine/engine'
import {
  anchorKey,
  cloneState,
  defaultAhaConfig,
  SimulationError,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import type {
  ActionSkill,
  ActorConfig,
  ConditionalRestoreOperation,
  EffectOperation,
  ParticipantNodeRecord,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'

const start = { kind: 'start' } as const
const action = (turn = 1, participantId = 'a') => ({ kind: 'action' as const, participantId, turn })
const neutral: ActionSkill = { kind: 'custom', cost: 0, recovery: 0 }
const actor = (id = 'a', position = 0): ActorConfig => ({
  id,
  kind: 'actor',
  camp: 'ally',
  category: 'character',
  position,
  name: id,
  baseSpeed: 100,
  panelSpeed: 100,
})
function plan(skills: (ActionSkill | undefined)[] = [neutral], initial = 3): SimulationPlan {
  return {
    aha: defaultAhaConfig(),
    cycleMode: 'none',
    actors: [actor()],
    maxNodes: skills.length,
    maxAV: 600,
    skillPoints: { enabled: true, initial, max: 5 },
    events: skills.map((skill, i) => ({
      anchor: action(i + 1),
      operations: [],
      ...(skill ? { skill } : {}),
    })),
  }
}
const restore = (
  id: string,
  amount: number,
  phase?: 'preAction' | 'postAction',
  storeOverflow = false,
): EffectOperation => ({
  id,
  type: 'restoreSkillPoints',
  amount,
  source: 'Synthetic restoration',
  storeOverflow,
  ...(phase ? { phase } : {}),
})
const presence = (
  type: 'depart' | 'returnToField',
  phase?: 'preAction' | 'postAction',
): EffectOperation => ({
  id: type,
  type,
  target: { kind: 'participants', participantIds: ['a'] },
  ...(phase ? { phase } : {}),
})
const refund = (
  turn: number,
  sourceParticipantId = 'a',
  outcome: 'proc' | 'no-proc' = 'proc',
  cooldownTurns = 1,
): ConditionalRestoreOperation => ({
  id: `refund-${sourceParticipantId}-${turn}`,
  type: 'conditionalRestore',
  phase: 'postAction',
  amount: 1,
  source: 'Synthetic refund',
  chance: 0.5,
  cooldownTurns,
  outcome,
  sourceParticipantId,
})
const participantRecord = (
  record: ReturnType<typeof simulatePlan>['records'][number],
): ParticipantNodeRecord => {
  if (record.kind === 'cycleBoundary') throw new Error('Expected participant action')
  return record
}

describe('Stage 2A formal Skill Point simulation', () => {
  it('pays skills and restores basics, reporting capped recovery and committed totals', () => {
    const result = simulatePlan(plan([{ kind: 'basic' }, { kind: 'basic' }, { kind: 'skill' }], 4))
    expect(result.records.map((r) => participantRecord(r).skillPoints)).toMatchObject([
      { status: 'known', before: 4, after: 5, paid: 0, recovery: 1, overflow: 0 },
      { status: 'known', before: 5, after: 5, paid: 0, recovery: 0, overflow: 1 },
      { status: 'known', before: 5, after: 4, paid: 1, recovery: 0, overflow: 0 },
    ])
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 1,
      totalRecovery: 1,
      endingBalance: 4,
    })
    expect(result.diagnostics.some((d) => d.code === 'sp-overflow')).toBe(true)
  })
  it('runs preAction restoration and payment before ordinary preAction operations', () => {
    const p = plan([{ kind: 'custom', cost: 6, recovery: 0 }], 0)
    p.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    p.events[0]!.operations = [presence('depart', 'preAction'), restore('fund', 6, 'preAction')]
    const result = simulatePlan(p)
    expect(result.blockedAction).toBeUndefined()
    expect(participantRecord(result.records[0]!).skillPoints).toMatchObject({
      before: 6,
      paid: 6,
      after: 0,
    })
    expect(result.records[0]!.maxChanges?.[0]).toMatchObject({ beforeMax: 7, afterMax: 5, loss: 0 })
    expect(result.skillPointsSummary).toMatchObject({
      endingBalance: 0,
      effectiveMax: 5,
      totalCost: 6,
      totalRecovery: 6,
    })
  })
  it('blocks atomically, discards candidate deposits, and marks the blocked anchor reached', () => {
    const p = plan([{ kind: 'skill' }, { kind: 'skill' }], 0)
    p.skillPoints!.max = 0
    p.events.unshift({ anchor: start, operations: [restore('opening', 4, undefined, true)] })
    p.events[1]!.operations = [
      restore('candidate', 2, 'preAction', true),
      refund(1),
      {
        id: 'never-spawn',
        type: 'spawnParticipant',
        phase: 'preAction',
        participant: { kind: 'scheduledEvent', name: 'Never', speed: 100 },
      },
    ]
    p.events[2]!.operations = [restore('future', 1, 'postAction')]
    const input = createInitialState(p)
    input.skillPoints!.stored = 4
    const before = cloneState(input)
    const step = stepSimulation(input, p.events[1]!.operations, { kind: 'skill' })
    expect(step.blocked).toBe(true)
    expect(step.state).toEqual(before)
    expect(input).toEqual(before)
    expect(step.record.refill).toBeUndefined()
    expect(step.record.conditionalRestores).toBeUndefined()
    expect(step.record.skillPointEvents?.[0]).toMatchObject({
      restored: 0,
      stored: 2,
      storedAfter: 6,
      committed: false,
    })
    expect(step.record.skillPointStorage?.storedAfter).toBe(4)
    const result = simulatePlan(p)
    expect(result.records).toHaveLength(0)
    expect(result.snapshots).toHaveLength(1)
    expect(result.blockedAction?.anchor).toEqual(action())
    expect(result.stopReason).toBe('error')
    expect(result.skillPointsSummary).toMatchObject({
      endingBalance: 0,
      storedBalance: 4,
      totalCost: 0,
      totalRecovery: 0,
    })
    expect(
      result.diagnostics.filter((d) => d.code === 'unreached-anchor').map((d) => d.anchor),
    ).toEqual([action(2)])
    expect(result.diagnostics.some((d) => d.code === 'sp-insufficient')).toBe(true)
    expect(result.blockedAction?.beforeEffects.skillPoints!.conditionalCooldowns.size).toBe(0)
  })
  it.each(['preAction', 'postAction'] as const)(
    'only preAction refunds can fund a zero-balance skill (%s)',
    (phase) => {
      const p = plan([{ kind: 'skill' }], 0)
      p.events[0]!.operations = [restore('fund', 1, phase)]
      const result = simulatePlan(p)
      expect(!!result.blockedAction).toBe(phase === 'postAction')
      expect(result.records).toHaveLength(phase === 'preAction' ? 1 : 0)
      expect(result.skillPointsSummary?.endingBalance).toBe(0)
    },
  )
  it('marks negative payment, continues settlement and keeps downstream nodes unverified', () => {
    const p = plan([{ kind: 'skill' }, { kind: 'basic' }, { kind: 'skill' }], 0)
    p.skillPoints!.onInsufficient = 'mark'
    const result = simulatePlan(p)
    expect(result.blockedAction).toBeUndefined()
    expect(result.records.map((r) => r.spValidation)).toEqual([
      'insufficient',
      'unverified',
      'unverified',
    ])
    expect(result.records.map((r) => participantRecord(r).skillPoints?.after)).toEqual([-1, 0, -1])
    expect(result.skillPointsSummary).toMatchObject({
      firstInsufficient: action(),
      totalCost: 2,
      totalRecovery: 1,
      endingBalance: -1,
      status: 'unverified',
    })
    p.skillPoints!.onInsufficient = 'stop'
    expect(simulatePlan(p).blockedAction?.anchor).toEqual(action())
  })
  it('settles custom skill recovery, then postAction restoration, then storage refill', () => {
    const p = plan([{ kind: 'custom', cost: 1, recovery: 2 }], 1)
    const input = createInitialState(p)
    input.skillPoints!.stored = 4
    const step = stepSimulation(input, [restore('post', 2, 'postAction')], p.events[0]!.skill)
    expect(participantRecord(step.record).skillPoints).toMatchObject({
      before: 1,
      paid: 1,
      recovery: 2,
      after: 2,
    })
    expect(step.record.skillPointEvents?.[0]).toMatchObject({ before: 2, after: 4, restored: 2 })
    expect(step.record.refill).toEqual({
      before: 4,
      after: 5,
      amount: 1,
      storedBefore: 4,
      storedAfter: 3,
    })
    expect(input.skillPoints).toMatchObject({ current: 1, stored: 4 })
    expect(step.state.skillPoints).toMatchObject({ current: 5, stored: 3 })
  })
  it('honors postAction list order and starts cooldown even for a fully overflowing proc', () => {
    const p = plan([{ kind: 'skill' }], 5)
    p.events.unshift({ anchor: start, operations: [restore('store', 2, undefined, true)] })
    p.events[1]!.operations = [restore('fill', 1, 'postAction'), refund(1)]
    const result = simulatePlan(p)
    expect(result.records[0]!.conditionalRestores?.[0]).toMatchObject({
      status: 'proc',
      before: 5,
      after: 5,
      restored: 0,
      overflow: 1,
      availableFromTurn: 3,
    })
    expect(result.records[0]!.refill).toBeUndefined()
    expect(result.records[0]!.skillPointStorage).toMatchObject({
      overflow: 1,
      wasted: 1,
      storedAfter: 2,
    })
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 1,
      totalRecovery: 1,
      storedBalance: 2,
    })
  })
  it('owns cooldowns by source turns despite interleaved allied turns and unique operation IDs', () => {
    const p = plan(
      Array.from({ length: 4 }, () => ({ kind: 'skill' })),
      5,
    )
    p.actors[0]!.panelSpeed = 200
    p.actors.push(actor('b', 1))
    p.events.forEach((event, i) => {
      event.operations = [refund(i + 1)]
    })
    for (const turn of [1, 2])
      p.events.push({
        anchor: action(turn, 'b'),
        skill: { kind: 'skill' },
        operations: [refund(turn, 'b')],
      })
    p.maxNodes = 6
    const result = simulatePlan(p)
    const statuses = (id: string) =>
      result.records
        .filter((r) => r.kind === 'actor' && r.id === id)
        .map((r) => r.conditionalRestores?.[0]?.status)
    expect(statuses('a')).toEqual(['proc', 'cooldown', 'proc', 'cooldown'])
    expect(statuses('b')).toEqual(['proc', 'cooldown'])
    expect(result.records[5]!.beforeEffects.skillPoints!.conditionalCooldowns).toEqual(
      new Map([
        ['a', 5],
        ['b', 3],
      ]),
    )
    expect(result.records[0]!.beforeEffects.skillPoints!.conditionalCooldowns.size).toBe(0)
  })
  it('preserves unknown balances, source cooldowns, no-proc expiry and zero cooldown', () => {
    const p = plan([undefined, ...Array.from({ length: 5 }, () => ({ kind: 'skill' as const }))])
    for (const turn of [2, 3, 4, 5, 6])
      p.events[turn - 1]!.operations = [
        refund(turn, 'a', turn === 3 || turn === 4 ? 'no-proc' : 'proc', turn >= 5 ? 0 : 1),
      ]
    const result = simulatePlan(p)
    expect(result.records.map((r) => r.spValidation)).toEqual(Array(6).fill('unknown'))
    expect(result.records.slice(1).map((r) => r.conditionalRestores?.[0]?.status)).toEqual([
      'proc',
      'cooldown',
      'no-proc',
      'proc',
      'proc',
    ])
    expect(result.records[1]!.conditionalRestores?.[0]).toMatchObject({
      before: null,
      after: null,
      restored: null,
      overflow: null,
      availableFromTurn: 4,
    })
    expect(result.records[3]!.conditionalRestores?.[0]).not.toHaveProperty('availableFromTurn')
    expect(result.records[4]!.conditionalRestores?.[0]?.availableFromTurn).toBe(6)
    expect(result.records[5]!.conditionalRestores?.[0]?.availableFromTurn).toBe(7)
    expect(result.records.every((r) => !r.refill)).toBe(true)
    expect(result.skillPointsSummary).toMatchObject({
      endingBalance: null,
      totalCost: null,
      totalRecovery: null,
    })
    expect(result.diagnostics.filter((d) => d.code === 'sp-unknown')).toHaveLength(1)
  })
  it('refunds and refills counterfactual actions without clearing insufficient status', () => {
    const p = plan([{ kind: 'skill' }], 0)
    p.skillPoints!.onInsufficient = 'mark'
    const input = createInitialState(p)
    input.skillPoints!.stored = 2
    const step = stepSimulation(input, [refund(1)], { kind: 'skill' })
    expect(step.record.spValidation).toBe('insufficient')
    expect(step.record.conditionalRestores?.[0]).toMatchObject({
      before: -1,
      after: 0,
      status: 'proc',
    })
    expect(step.record.refill).toMatchObject({ before: 0, after: 2, amount: 2, storedAfter: 0 })
    expect(step.state.skillPoints).toMatchObject({ current: 2, unverified: true })
  })
  it.each(['summon', 'memosprite'] as const)(
    'never auto-pays or refills %s, but executes explicit restoration/refunds',
    (category) => {
      for (const skill of [undefined, { kind: 'custom', cost: 99, recovery: 99 }] as (
        ActionSkill | undefined
      )[]) {
        const p = plan([skill], 0)
        p.actors[0]!.category = category
        p.events[0]!.operations = [restore('explicit', 1, 'postAction'), refund(1)]
        const input = createInitialState(p)
        input.skillPoints!.stored = 4
        const step = stepSimulation(input, p.events[0]!.operations, skill)
        expect(step.blocked).toBeUndefined()
        expect(participantRecord(step.record).skillPoints).toBeUndefined()
        expect(step.record.spValidation).toBe('known')
        expect(step.record.refill).toBeUndefined()
        expect(step.state.skillPoints).toMatchObject({ current: 2, stored: 4 })
        expect(
          step.diagnostics.some((d) => ['sp-insufficient', 'sp-unknown'].includes(d.code)),
        ).toBe(false)
        expect(simulatePlan(p).skillPointsSummary).toMatchObject({
          totalCost: 0,
          totalRecovery: 2,
          endingBalance: 2,
        })
      }
    },
  )
  it.each(['enemy', 'aha', 'scheduledEvent'] as const)(
    'does not auto-pay or refill %s nodes',
    (kind) => {
      const p = plan()
      if (kind === 'enemy') p.actors[0]!.camp = 'enemy'
      if (kind === 'aha') {
        p.aha.baseSpeed = 1000
        p.aha.contributorIds = ['a']
      }
      const input = createInitialState(p)
      if (kind === 'scheduledEvent') {
        input.participants.unshift({
          kind: 'scheduledEvent',
          id: 'clock',
          name: 'Clock',
          speed: 100,
          remainingAG: 0,
          departed: false,
          order: input.nextOrder++,
          zeroBatch: 0,
          zeroOrder: 0,
          pendingActionChanges: [],
          modifiers: [],
        })
        input.issuedParticipantIds.add('clock')
      }
      input.skillPoints!.stored = 4
      const step = stepSimulation(input, [])
      expect(participantRecord(step.record).skillPoints).toBeUndefined()
      expect(step.record.refill).toBeUndefined()
      expect(step.state.skillPoints).toMatchObject({ current: 3, stored: 4 })
    },
  )
  it('recalculates caps for event-driven departure, return, refill, and action-limit removal', () => {
    const p = plan([neutral], 7)
    p.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    p.actors[0]!.initialAG = 20000
    p.actors[0]!.actionLimit = 1
    p.actors.push({ ...actor('b', 1), actionLimit: 1 })
    const clock = spawnedParticipantId('clock')
    p.events.unshift({
      anchor: start,
      operations: [
        restore('store', 4, undefined, true),
        {
          id: 'clock',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Clock', speed: 200 },
        },
      ],
    })
    p.events.push(
      { anchor: { kind: 'trigger', participantId: clock }, operations: [presence('depart')] },
      {
        anchor: action(1, 'b'),
        skill: neutral,
        operations: [presence('returnToField', 'postAction')],
      },
    )
    p.maxNodes = 3
    const result = simulatePlan(p)
    expect(result.records.map((r) => r.elapsedAV)).toEqual([50, 100, 250])
    expect(result.records[0]!.maxChanges?.[0]).toMatchObject({
      beforeMax: 7,
      afterMax: 5,
      before: 7,
      after: 5,
      loss: 2,
    })
    expect(result.records[1]!.maxChanges?.[0]).toMatchObject({
      beforeMax: 5,
      afterMax: 7,
      before: 5,
      after: 5,
      loss: 0,
    })
    expect(result.records[1]!.refill).toMatchObject({
      amount: 2,
      before: 5,
      after: 7,
      storedBefore: 4,
      storedAfter: 2,
    })
    expect(result.records[2]!.maxChanges?.[0]).toMatchObject({
      reason: 'removal',
      beforeMax: 7,
      afterMax: 5,
      loss: 2,
    })
    expect(result.skillPointsSummary).toMatchObject({
      effectiveMax: 5,
      endingBalance: 5,
      storedBalance: 2,
      capLoss: 4,
    })
  })
  it('records unknown cap loss without changing storage or inventing a loss warning', () => {
    const p = plan([undefined], 7)
    p.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    p.events.unshift({ anchor: start, operations: [restore('store', 4, undefined, true)] })
    p.events[1]!.operations = [presence('depart', 'postAction')]
    const result = simulatePlan(p)
    expect(result.records[0]!.maxChanges?.[0]).toMatchObject({
      before: null,
      after: null,
      loss: null,
    })
    expect(result.skillPointsSummary).toMatchObject({
      endingBalance: null,
      storedBalance: 4,
      effectiveMax: 5,
      capLoss: null,
    })
    expect(result.diagnostics.some((d) => d.code === 'sp-cap-loss')).toBe(false)
  })
  it.each(['depart', 'removal'] as const)(
    'rolls back the action when %s would make the cap negative',
    (transition) => {
      const p = plan([neutral], 0)
      p.skillPoints!.maxModifiers = [{ amount: -6 }, { amount: 2, sourceParticipantId: 'a' }]
      if (transition === 'depart')
        p.events[0]!.operations = [
          restore('candidate', 3, 'preAction', true),
          presence('depart', 'postAction'),
        ]
      else p.actors[0]!.actionLimit = 1
      const input = createInitialState(p)
      input.skillPoints!.stored = 4
      const before = cloneState(input)
      expect(() => stepSimulation(input, p.events[0]!.operations, neutral)).toThrow(SimulationError)
      expect(input).toEqual(before)
      const result = simulatePlan(p)
      expect(result.records).toHaveLength(0)
      expect(result.blockedAction).toBeUndefined()
      expect(result.diagnostics.some((d) => d.code === 'invalid-sp-max')).toBe(true)
      expect(result.skillPointsSummary).toMatchObject({
        endingBalance: 0,
        effectiveMax: 1,
        totalRecovery: 0,
        storedBalance: 0,
      })
    },
  )
  it('records cycle-boundary cap changes without altering same-AV action priority', () => {
    const p = plan([neutral], 7)
    p.cycleMode = 'moc'
    p.maxNodes = 2
    p.maxAV = 150
    p.actors[0]!.initialAG = 15000
    p.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    p.events.push({
      anchor: { kind: 'cycleBoundary', ordinal: 1 },
      operations: [presence('depart')],
    })
    const result = simulatePlan(p)
    expect(result.records.map((r) => anchorKey(r.anchor))).toEqual([
      anchorKey(action()),
      'cycleBoundary:1',
    ])
    expect(result.records.map((r) => r.elapsedAV)).toEqual([150, 150])
    expect(result.records[1]!.maxChanges?.[0]?.loss).toBe(2)
    expect(result.skillPointsSummary?.capLoss).toBe(2)
  })
  it('keeps the upstream zero-AV ordering, traces, turn expiry and node budget with SP enabled', () => {
    const p = plan([neutral], 3)
    p.cycleMode = 'moc'
    p.maxAV = 150
    p.maxNodes = 4
    p.actors = [
      { ...actor(), initialAG: 15000, actionLimit: 1 },
      { ...actor('b', 1), initialAG: 15000, actionLimit: 1 },
    ]
    p.events[0]!.operations = [
      {
        id: 'clock',
        type: 'spawnParticipant',
        phase: 'postAction',
        participant: { kind: 'scheduledEvent', name: 'Clock', speed: 90, initialAG: 0 },
      },
      {
        id: 'immediate',
        type: 'immediatelyAct',
        phase: 'postAction',
        target: { kind: 'participants', participantIds: ['b'] },
      },
    ]
    p.events.push({ anchor: action(1, 'b'), skill: neutral, operations: [] })
    const enabled = simulatePlan(p)
    const disabled = simulatePlan({ ...p, skillPoints: { enabled: false } })
    expect(enabled.records.map((r) => anchorKey(r.anchor))).toEqual([
      anchorKey(action()),
      anchorKey(action(1, 'b')),
      `trigger:${encodeURIComponent(spawnedParticipantId('clock'))}`,
      'cycleBoundary:1',
    ])
    expect(enabled.records.map((r) => r.elapsedAV)).toEqual([150, 150, 150, 150])
    expect(enabled.snapshots).toEqual(disabled.snapshots)
    expect(
      enabled.records.map((r) => ({
        anchor: r.anchor,
        deltaAV: r.deltaAV,
        changes: r.actionChanges,
        participants: r.beforeEffects.participants,
        completedActions: r.beforeEffects.completedActions,
      })),
    ).toEqual(
      disabled.records.map((r) => ({
        anchor: r.anchor,
        deltaAV: r.deltaAV,
        changes: r.actionChanges,
        participants: r.beforeEffects.participants,
        completedActions: r.beforeEffects.completedActions,
      })),
    )
  })
  it('ignores all resource effects when SP is disabled, retaining the upstream result shape', () => {
    const p = plan([{ kind: 'skill' }, { kind: 'skill' }], 0)
    p.skillPoints!.enabled = false
    p.events.unshift({ anchor: start, operations: [restore('opening', 6, undefined, true)] })
    p.events[1]!.operations = [restore('pre', 1, 'preAction'), refund(1)]
    const result = simulatePlan(p)
    const noResources = structuredClone(p)
    delete noResources.skillPoints
    noResources.events.forEach((event) => {
      event.operations = []
      delete event.skill
    })
    expect(result).toEqual(simulatePlan(noResources))
    expect(result).not.toHaveProperty('skillPointsSummary')
    expect(result.records.every((r) => !r.spValidation && !r.refill)).toBe(true)
  })
})
