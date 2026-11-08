import {
  addSkillPoints,
  addSkillPointTotal,
  cappedSkillPointIncrease,
  effectiveSkillPointMax,
} from './skill-point-arithmetic'
import type {
  ActorDefinition,
  ActionSkill,
  SkillPointsConfig,
  SkillPointsRecord,
  SkillPointsState,
  SkillPointRefillRecord,
  SkillPointStorageRecord,
  SkillPointEventRecord,
} from './types'

export interface SkillPointParticipant {
  kind: string
  camp?: string
  category?: ActorDefinition['category']
}
/** Automatic skill settlement and turn-end refill belong only to allied non-summon actors. */
export function usesSkillPoints(actor: SkillPointParticipant | undefined): boolean {
  return (
    actor?.kind === 'actor' &&
    actor.camp === 'ally' &&
    actor.category !== 'summon' &&
    actor.category !== 'memosprite'
  )
}

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const count = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
export function validSkillPoints(v: unknown): v is SkillPointsConfig {
  if (
    !object(v) ||
    Object.keys(v).some(
      (k) =>
        !['enabled', 'initial', 'max', 'onInsufficient', 'storedMax', 'maxModifiers'].includes(k),
    ) ||
    (v.onInsufficient !== undefined &&
      v.onInsufficient !== 'stop' &&
      v.onInsufficient !== 'mark') ||
    (v.enabled !== undefined && typeof v.enabled !== 'boolean') ||
    (v.initial !== undefined && !count(v.initial)) ||
    (v.max !== undefined && !count(v.max)) ||
    (v.storedMax !== undefined && !count(v.storedMax))
  )
    return false
  const modifiers = v.maxModifiers ?? []
  if (
    !Array.isArray(modifiers) ||
    !modifiers.every(
      (m) =>
        object(m) &&
        Object.keys(m).every((k) => ['amount', 'sourceParticipantId'].includes(k)) &&
        typeof m.amount === 'number' &&
        Number.isSafeInteger(m.amount) &&
        m.amount !== 0 &&
        (m.sourceParticipantId === undefined ||
          (typeof m.sourceParticipantId === 'string' && m.sourceParticipantId.trim().length > 0)),
    )
  )
    return false
  // All initial actors are present before start operations. Source membership is checked by validatePlan.
  const initialMax = effectiveSkillPointMax((v.max ?? 5) as number, modifiers)
  return initialMax !== undefined && ((v.initial ?? 3) as number) <= initialMax
}
export function validActionSkill(v: unknown): v is ActionSkill {
  return (
    object(v) &&
    (v.kind === 'custom'
      ? Object.keys(v).every((k) => ['kind', 'cost', 'recovery'].includes(k)) &&
        count(v.cost) &&
        count(v.recovery)
      : Object.keys(v).every((k) => k === 'kind') && (v.kind === 'basic' || v.kind === 'skill'))
  )
}
/** Payment happens before any action effects; restoration happens only after successful settlement. */
export function paySkillPoints(state: SkillPointsState, skill?: ActionSkill): SkillPointsRecord {
  const before = state.current
  if (before === null || !skill) {
    state.current = null
    return { status: 'unknown', before, after: null, paid: null, recovery: null, overflow: null }
  }
  const cost = skill.kind === 'custom' ? skill.cost : skill.kind === 'skill' ? 1 : 0
  const recovery = skill.kind === 'custom' ? skill.recovery : skill.kind === 'basic' ? 1 : 0
  const afterPayment = addSkillPoints(before, -cost)
  const shortfall = Math.max(0, -afterPayment)
  if (before < cost && state.onInsufficient !== 'mark')
    return {
      status: 'insufficient',
      before,
      after: before,
      cost,
      paid: 0,
      plannedRecovery: recovery,
      recovery: 0,
      overflow: 0,
      shortfall,
    }
  const status = state.unverified ? 'unverified' : before < cost ? 'insufficient' : 'known'
  if (before < cost) state.unverified = true
  state.current = afterPayment
  return {
    status,
    before,
    after: state.current,
    cost,
    paid: cost,
    plannedRecovery: recovery,
    recovery,
    shortfall,
  }
}

export function restoreSkillPoints(state: SkillPointsState, record: SkillPointsRecord): void {
  if (record.status === 'unknown' || state.current === null) return
  const requested = record.recovery!
  const actual = cappedSkillPointIncrease(state.current, state.max, requested)
  const after = addSkillPoints(state.current, actual)
  const overflow = addSkillPoints(requested, -actual)
  state.current = after
  record.after = after
  record.recovery = actual
  record.overflow = overflow
}

/** Only explicit restoration operations opt into storage; skill restoration still discards overflow. */
export function storeSkillPointOverflow(
  state: SkillPointsState,
  overflow: number | null,
  enabled: boolean,
) {
  if (overflow === null) {
    if (enabled && state.storedMax > 0) state.stored = null
    return {
      stored: enabled && state.storedMax > 0 ? null : 0,
      wasted: null,
      storedAfter: state.stored,
    }
  }
  const stored =
    enabled && state.storedMax > 0
      ? state.stored === null
        ? null
        : cappedSkillPointIncrease(state.stored, state.storedMax, overflow)
      : 0
  const wasted = stored === null ? null : addSkillPoints(overflow, -stored)
  state.stored = addSkillPointTotal(state.stored, stored)
  return { stored, wasted, storedAfter: state.stored }
}
export function refillSkillPoints(state: SkillPointsState): SkillPointRefillRecord | undefined {
  if (
    state.current === null ||
    state.stored === null ||
    state.current >= state.max ||
    state.stored <= 0
  )
    return undefined
  const before = state.current
  const storedBefore = state.stored
  const amount = cappedSkillPointIncrease(before, state.max, storedBefore)
  const after = addSkillPoints(before, amount)
  const storedAfter = addSkillPoints(storedBefore, -amount)
  state.current = after
  state.stored = storedAfter
  return { amount, before, after, storedBefore, storedAfter }
}
export function skillPointStorageRecord(
  state: SkillPointsState,
  events: readonly SkillPointEventRecord[],
  skillOverflow: number | null = 0,
): SkillPointStorageRecord {
  const sum = (field: 'overflow' | 'stored' | 'wasted', initial: number | null) =>
    events.reduce<number | null>((total, event) => addSkillPointTotal(total, event[field]), initial)
  return {
    overflow: sum('overflow', skillOverflow),
    stored: sum('stored', 0),
    wasted: sum('wasted', skillOverflow),
    storedAfter: state.stored,
  }
}
