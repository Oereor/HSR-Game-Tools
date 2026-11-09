import type { EffectOperation, EffectPhase } from './types'

export function phaseOperations(
  operations: readonly EffectOperation[],
  phase: EffectPhase,
): EffectOperation[] {
  return operations.filter((operation) => operation.phase === phase)
}

/** Stable priority within a single execution group. */
export function orderOperations(operations: readonly EffectOperation[]): EffectOperation[] {
  return [
    ...operations.filter((operation) => operation.type === 'changeSkillPoints'),
    ...operations.filter((operation) => operation.type !== 'changeSkillPoints'),
  ]
}
