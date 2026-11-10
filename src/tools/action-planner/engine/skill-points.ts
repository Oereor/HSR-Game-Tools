import type { SkillPointsConfig, SkillPointsState } from './types'

export const DEFAULT_SKILL_POINTS = { initial: 3, max: 5 } as const

export function validSkillPoints(value: unknown): value is SkillPointsConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const {
    enabled,
    initial = DEFAULT_SKILL_POINTS.initial,
    max = DEFAULT_SKILL_POINTS.max,
  } = value as SkillPointsConfig
  return (
    Object.keys(value).every((key) => ['enabled', 'initial', 'max'].includes(key)) &&
    (enabled === undefined || typeof enabled === 'boolean') &&
    Number.isSafeInteger(initial) &&
    Number.isSafeInteger(max) &&
    initial >= 0 &&
    initial <= max
  )
}

export function skillPointBalance(state: SkillPointsState, amount: number): bigint {
  const after = state.current + BigInt(amount)
  const cap = BigInt(state.max)
  return after > cap ? cap : after
}
