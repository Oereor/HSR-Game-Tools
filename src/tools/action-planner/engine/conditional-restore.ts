import { addSkillPoints, cappedSkillPointIncrease } from './skill-point-arithmetic'
import type {
  ConditionalRestoreOperation,
  ConditionalRestoreRecord,
  SkillPointsState,
} from './types'

/** The caller supplies the selected result; chance is deliberately never sampled or averaged. */
export function conditionalRestore(
  state: SkillPointsState,
  operation: ConditionalRestoreOperation,
  turn: number,
): ConditionalRestoreRecord {
  const available = state.conditionalCooldowns.get(operation.sourceParticipantId)
  const record: ConditionalRestoreRecord = {
    operationId: operation.id,
    source: operation.source,
    sourceParticipantId: operation.sourceParticipantId,
    amount: operation.amount,
    chance: operation.chance,
    cooldownTurns: operation.cooldownTurns,
    outcome: operation.outcome,
    status: 'no-proc',
    before: state.current,
    after: state.current,
    restored: 0,
    overflow: 0,
    stored: 0,
    wasted: 0,
    storedAfter: state.stored,
  }
  if (available !== undefined && turn < available) {
    record.status = 'cooldown'
    record.availableFromTurn = available
    return record
  }
  if (operation.outcome === 'no-proc') return record
  const availableFromTurn = addSkillPoints(addSkillPoints(turn, operation.cooldownTurns), 1)
  record.status = 'proc'
  record.availableFromTurn = availableFromTurn
  if (state.current === null) {
    state.conditionalCooldowns.set(operation.sourceParticipantId, availableFromTurn)
    Object.assign(record, { restored: null, overflow: null, stored: null, wasted: null })
    return record
  }
  const restored = cappedSkillPointIncrease(state.current, state.max, operation.amount)
  const after = addSkillPoints(state.current, restored)
  const overflow = addSkillPoints(operation.amount, -restored)
  state.conditionalCooldowns.set(operation.sourceParticipantId, availableFromTurn)
  state.current = after
  Object.assign(record, {
    after,
    restored,
    overflow,
    wasted: overflow,
  })
  return record
}
