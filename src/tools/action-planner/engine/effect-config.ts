import type { EffectOperation, EffectPhase, SkillPointOperation } from './types'

export function isSkillPointOperationType(
  type: EffectOperation['type'],
): type is SkillPointOperation['type'] {
  return type === 'changeSkillPoints' || type === 'characterEffect'
}

export function isSkillPointOperation(
  operation: EffectOperation,
): operation is SkillPointOperation {
  return isSkillPointOperationType(operation.type)
}

export function phaseOperations(
  operations: readonly EffectOperation[],
  phase: EffectPhase,
): EffectOperation[] {
  return operations.filter((operation) => operation.phase === phase)
}

/** Stable priority within a single execution group. */
export function orderOperations(operations: readonly EffectOperation[]): EffectOperation[] {
  return [
    ...operations.filter(isSkillPointOperation),
    ...operations.filter((operation) => !isSkillPointOperation(operation)),
  ]
}
