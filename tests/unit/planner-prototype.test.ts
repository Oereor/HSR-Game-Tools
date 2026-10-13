import { describe, expect, it } from 'vitest'
import {
  parseDraft,
  newDraft,
  usePlannerPrototype,
  type PrototypeOperation,
} from '../../src/tools/action-planner/prototype/state'
import { simulatePlan } from '../../src/engine/action-planner/engine'
import {
  samplePlan,
  anchorKey,
  initialOperations,
} from '../../src/tools/action-planner/prototype/sample'

describe('design-spike state boundary', () => {
  const operation: PrototypeOperation = {
    id: 'original',
    kind: 'speed',
    targets: ['1001'],
    mode: 'flat',
    amount: 20,
    phase: 'postAction',
    duration: { kind: 'turns', turns: 2 },
  }
  it('discards drafts when changing nodes and returns the next overview', () => {
    const state = usePlannerPrototype(['a', 'b'], { a: [operation] })
    state.edit(operation)
    state.draft.value!.amount = 88
    state.select('b')
    expect(state.selected.value).toBe('b')
    expect(state.draft.value).toBeUndefined()
    expect(state.committed.value.a).toEqual([operation])
  })
  it('cancel does not change committed values or target arrays', () => {
    const state = usePlannerPrototype(['a'], { a: [operation] })
    state.edit(operation)
    state.draft.value!.targets.push('1101')
    state.draft.value!.amount = 77
    state.cancel()
    expect(state.operations.value).toEqual([operation])
  })
  it('parses only the selected duration and validates active fields', () => {
    const draft = newDraft()
    draft.countdownName = ''
    draft.countdownSpeed = -1
    expect(parseDraft(draft, 'x').operation).toMatchObject({
      duration: { kind: 'turns', turns: 2 },
    })
    draft.duration = 'countdown'
    expect(parseDraft(draft, 'x').errors).toEqual(['countdownName', 'countdownSpeed'])
    draft.countdownName = 'Timer'
    draft.countdownSpeed = 70
    draft.turns = null
    expect(parseDraft(draft, 'x').operation).toMatchObject({
      duration: { kind: 'countdown', name: 'Timer', speed: 70 },
    })
    expect(parseDraft(draft, 'x').operation).not.toHaveProperty('duration.turns')
  })
  it('commits and removes local operations without altering the fixed plan or result', () => {
    const planBefore = JSON.stringify(samplePlan)
    const result = simulatePlan(samplePlan)
    const before = JSON.stringify(result)
    const state = usePlannerPrototype(
      result.records.map((r) => anchorKey(r.anchor)),
      initialOperations,
    )
    const original = state.operations.value[0]!
    state.edit(original)
    state.draft.value!.amount = 42
    expect(state.submit()).toBe(true)
    expect(state.operations.value[0]).toMatchObject({ amount: 42, id: original.id })
    state.remove(original.id)
    expect(state.operations.value.some((o) => o.id === original.id)).toBe(false)
    expect(JSON.stringify(samplePlan)).toBe(planBefore)
    expect(JSON.stringify(result)).toBe(before)
    expect(result.diagnostics).toEqual([])
    expect(result.records.some((r) => r.kind === 'scheduledEvent')).toBe(true)
    expect(result.records.some((r) => r.actionChanges.some((c) => c.type === 'advance'))).toBe(true)
    expect(result.records.some((r) => r.actionChanges.some((c) => c.type === 'delay'))).toBe(true)
  })
})
