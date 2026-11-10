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
export function orderOperations<T extends Pick<EffectOperation, 'type'>>(
  operations: readonly T[],
): T[] {
  return [
    ...operations.filter((operation) => isSkillPointOperationType(operation.type)),
    ...operations.filter((operation) => !isSkillPointOperationType(operation.type)),
  ]
}
