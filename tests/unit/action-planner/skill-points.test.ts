import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  previewOperationState,
  simulatePlan,
  spawnedParticipantId,
  validatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import type {
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'
import { contextAt } from '../../../src/tools/action-planner/model/editor'
import { emptyDocument } from '../../../src/tools/action-planner/model/document-file'

const start: EventAnchor = { kind: 'start' }
const action = (turn: number): EventAnchor => ({ kind: 'action', participantId: 'ally', turn })
const change = (id: string, amount: number, phase?: EffectPhase): EffectOperation => ({
  id,
  type: 'changeSkillPoints',
  amount,
  ...(phase ? { phase } : {}),
})
const plan = (): SimulationPlan => ({
  ...emptyDocument().plan,
  maxNodes: 5,
  actors: [
    {
      kind: 'actor',
      id: 'ally',
      name: 'Ally',
      position: 0,
      camp: 'ally',
      baseSpeed: 100,
      panelSpeed: 100,
    },
  ],
  skillPoints: { enabled: true },
})
const balances = (result: ReturnType<typeof simulatePlan>) =>
  result.snapshots.map((snapshot) => snapshot.skillPoints?.current)
const warnings = (result: ReturnType<typeof simulatePlan>) =>
  result.diagnostics.filter((issue) => issue.code.startsWith('sp-'))

describe('explicit skill point changes', () => {
  it('starts disabled by default, and validates the default and configured starting balances', () => {
    expect(createInitialState(emptyDocument().plan).skillPoints).toBeUndefined()
    const input = plan()
    expect(createInitialState(input).skillPoints).toEqual({ current: 3n, max: 5 })
    input.skillPoints = { enabled: true, initial: 7, max: 9 }
    expect(createInitialState(input).skillPoints).toEqual({ current: 7n, max: 9 })
    expect(
      validatePlan({ ...input, skillPoints: { enabled: true, initial: 10, max: 9 } }),
    ).not.toHaveLength(0)
  })

  it('applies caps before the next change and gives zero no effect', () => {
    const input = plan()
    const gain = change('gain', 6)
    const spend = change('spend', -3)
    const zero = change('zero', 0)
    input.events = [{ anchor: start, operations: [gain, spend, zero] }]
    expect(balances(simulatePlan(input))).toEqual([2n, 2n, 2n, 2n, 2n, 2n])
    input.events[0].operations = [spend, zero, gain]
    expect(balances(simulatePlan(input))).toEqual([5n, 5n, 5n, 5n, 5n, 5n])
  })

  it('keeps exact negative balances, warns once per node and highlights only the first warning', () => {
    const input = plan()
    const large = Number.MAX_SAFE_INTEGER
    input.events = [
      { anchor: start, operations: [change('first', -large), change('another', -large)] },
      { anchor: action(1), operations: [change('partial', large, 'postAction')] },
      { anchor: action(2), operations: [change('zero', 0, 'preAction')] },
      {
        anchor: action(3),
        operations: [
          change('still-negative', -1, 'preAction'),
          change('post-spend', -1, 'postAction'),
        ],
      },
      { anchor: action(4), operations: [change('restore', large, 'preAction')] },
      { anchor: action(5), operations: [change('cross-again', -2, 'postAction')] },
    ]
    const result = simulatePlan(input)
    expect(result.stopReason).toBe('nodes')
    expect(balances(result)).toEqual([
      3n - 2n * BigInt(large),
      3n - BigInt(large),
      3n - BigInt(large),
      1n - BigInt(large),
      1n,
      -1n,
    ])
    expect(
      warnings(result).map(({ anchor, code, operationId }) => [anchor, code, operationId]),
    ).toEqual([
      [start, 'sp-negative-first', 'first'],
      [action(3), 'sp-negative', 'still-negative'],
      [action(5), 'sp-negative', 'cross-again'],
    ])
  })

  it('shares priority and pre/post ordering with previews', () => {
    const input = plan()
    const anchor = action(1)
    const ops: EffectOperation[] = [
      {
        id: 'missing-pre',
        type: 'advance',
        phase: 'preAction',
        percent: 50,
        target: { kind: 'participants', participantIds: ['missing'] },
      },
      change('pre-spend', -4, 'preAction'),
      change('post-gain', 7, 'postAction'),
      change('post-spend', -2, 'postAction'),
    ]
    input.events = [{ anchor, operations: ops }]
    const result = simulatePlan(input)
    const context = contextAt(input, result, anchor)!
    expect(context.skillPoints?.current).toBe(3n)
    expect(result.diagnostics.slice(0, 2).map((issue) => issue.operationId)).toEqual([
      'pre-spend',
      'missing-pre',
    ])
    expect(
      previewOperationState(context, ops, anchor, 'preAction', 'missing-pre')?.skillPoints?.current,
    ).toBe(-1n)
    expect(
      previewOperationState(context, ops, anchor, 'postAction', 'post-gain')?.skillPoints?.current,
    ).toBe(-1n)
    expect(
      previewOperationState(context, ops, anchor, 'postAction', 'post-spend')?.skillPoints?.current,
    ).toBe(5n)
    expect(
      previewOperationState(context, ops, anchor, 'postAction', 'pre-spend', true)?.skillPoints
        ?.current,
    ).toBe(3n)
    expect(balances(result)[1]).toBe(3n)
  })

  it('settles start, trigger and cycle anchors and leaves the timeline unchanged when disabled', () => {
    const input = plan()
    input.cycleMode = 'moc'
    const trigger: EventAnchor = { kind: 'trigger', participantId: spawnedParticipantId('timer') }
    const boundary: EventAnchor = { kind: 'cycleBoundary', ordinal: 1 }
    input.events = [
      {
        anchor: start,
        operations: [
          {
            id: 'timer',
            type: 'spawnParticipant',
            participant: { kind: 'scheduledEvent', name: 'Timer', speed: 100, initialAG: 200 },
          },
          change('opening', 3),
        ],
      },
      { anchor: trigger, operations: [change('trigger-spend', -2)] },
      { anchor: boundary, operations: [change('boundary-spend', -4)] },
    ]
    const result = simulatePlan(input)
    expect(balances(result).slice(0, 4)).toEqual([5n, 3n, 3n, -1n])
    expect(warnings(result)[0]?.anchor).toEqual(boundary)
    const disabled = { ...input, skillPoints: { enabled: false } }
    expect(simulatePlan(disabled)).toEqual(
      simulatePlan({
        ...disabled,
        events: disabled.events.map((event) => ({
          ...event,
          operations: event.operations.filter((op) => op.type !== 'changeSkillPoints'),
        })),
      }),
    )
  })
})
