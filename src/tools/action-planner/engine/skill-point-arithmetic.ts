import { fail } from './queue'
import type { SkillPointMaxModifier } from './types'

const { MAX_SAFE_INTEGER, MIN_SAFE_INTEGER } = Number

/** Check the result's range before adding, so even a rejected sum never rounds. */
export function addSkillPoints(left: number, right: number): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    (right > 0 ? left > MAX_SAFE_INTEGER - right : left < MIN_SAFE_INTEGER - right)
  )
    fail('sp-arithmetic')
  return left + right
}

export function addSkillPointTotal(total: number | null, amount: number | null): number | null {
  return total === null || amount === null ? null : addSkillPoints(total, amount)
}

/** A negative mark-mode balance can make the full gap larger than any safe request. */
export function cappedSkillPointIncrease(current: number, cap: number, requested: number): number {
  return current <= addSkillPoints(cap, -requested) ? requested : addSkillPoints(cap, -current)
}

export function effectiveSkillPointMax(
  base: number,
  modifiers: readonly SkillPointMaxModifier[],
  present: (id: string) => boolean = () => true,
): number | undefined {
  // Signed modifiers can cancel across the safe range. Only expose the final exact cap.
  let cap = BigInt(base)
  for (const modifier of modifiers)
    if (modifier.sourceParticipantId === undefined || present(modifier.sourceParticipantId))
      cap += BigInt(modifier.amount)
  if (cap < 0n || cap > BigInt(MAX_SAFE_INTEGER)) return undefined
  return Number(cap)
}
