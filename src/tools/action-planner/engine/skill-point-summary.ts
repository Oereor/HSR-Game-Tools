import { addSkillPointTotal } from './skill-point-arithmetic'
import type {
  ParticipantNodeRecord,
  SimulationResult,
  SkillPointsState,
  SkillPointsSummary,
} from './types'

type SkillPointTotals = Pick<SkillPointsSummary, 'totalCost' | 'totalRecovery' | 'capLoss'>
type SkillPointContributions = Pick<
  ParticipantNodeRecord,
  'skillPoints' | 'refill' | 'skillPointEvents' | 'conditionalRestores' | 'maxChanges'
>

export const emptySkillPointTotals: Readonly<SkillPointTotals> = {
  totalCost: 0,
  totalRecovery: 0,
  capLoss: 0,
}

/** A candidate's exact totals are checked before any of its records can commit. */
export function accumulateSkillPointTotals(
  totals: SkillPointTotals,
  change: SkillPointContributions,
): SkillPointTotals {
  let { totalCost, totalRecovery, capLoss } = totals
  const skill = change.skillPoints
  if (skill) {
    totalCost = addSkillPointTotal(totalCost, skill.paid === null ? null : (skill.paid ?? 0))
    totalRecovery = addSkillPointTotal(
      totalRecovery,
      skill.recovery === null ? null : (skill.recovery ?? 0),
    )
  }
  if (change.refill) totalRecovery = addSkillPointTotal(totalRecovery, change.refill.amount)
  for (const event of [...(change.skillPointEvents ?? []), ...(change.conditionalRestores ?? [])])
    if (event.committed !== false) totalRecovery = addSkillPointTotal(totalRecovery, event.restored)
  for (const capChange of change.maxChanges ?? [])
    capLoss = addSkillPointTotal(capLoss, capChange.loss)
  return { totalCost, totalRecovery, capLoss }
}

/** Counts committed execution only. Unknown actions make complete totals unknowable. */
export function summarizeSkillPoints(
  result: SimulationResult,
  state: SkillPointsState,
  totals = result.records.reduce(
    accumulateSkillPointTotals,
    accumulateSkillPointTotals(emptySkillPointTotals, {
      skillPointEvents: result.startSkillPointEvents,
      maxChanges: result.startMaxChanges,
    }),
  ),
): SkillPointsSummary {
  const first = [...result.records, ...(result.blockedAction ? [result.blockedAction] : [])].find(
    (record) => record.kind !== 'cycleBoundary' && record.skillPoints?.status === 'insufficient',
  )
  return {
    ...(first && first.anchor.kind !== 'cycleBoundary'
      ? { firstInsufficient: { ...first.anchor } }
      : {}),
    ...totals,
    endingBalance: state.current,
    storedBalance: state.stored,
    baseMax: state.baseMax,
    effectiveMax: state.max,
    status: result.blockedAction
      ? 'insufficient'
      : state.current === null
        ? 'unknown'
        : state.unverified
          ? 'unverified'
          : 'known',
  }
}
