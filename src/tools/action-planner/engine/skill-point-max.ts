import { fail } from './queue'
import { addSkillPoints, effectiveSkillPointMax } from './skill-point-arithmetic'
import type { SimulationState, SkillPointMaxChange } from './types'

/** Recomputed inside the same candidate transaction as presence/removal. Storage is untouched. */
export function recomputeSkillPointMax(
  state: SimulationState,
  reason: SkillPointMaxChange['reason'],
  operationId?: string,
  participantId?: string,
): SkillPointMaxChange | undefined {
  const sp = state.skillPoints
  if (!sp) return
  const afterMax = effectiveSkillPointMax(sp.baseMax, sp.maxModifiers, (id) =>
    state.participants.some(
      (p) => p.id === id && p.kind === 'actor' && p.camp === 'ally' && !p.departed,
    ),
  )
  if (afterMax === undefined) fail('invalid-sp-max')
  if (reason === 'initial' && sp.current !== null && sp.current > afterMax) fail('invalid-sp-max')
  const beforeMax = sp.max
  if (beforeMax === afterMax) return
  const before = sp.current
  const after = afterMax < beforeMax && before !== null && before > afterMax ? afterMax : before
  const loss = before === null || after === null ? null : addSkillPoints(before, -after)
  sp.max = afterMax
  sp.current = after
  return {
    reason,
    operationId,
    participantId,
    beforeMax,
    afterMax,
    before,
    after,
    loss,
  }
}
