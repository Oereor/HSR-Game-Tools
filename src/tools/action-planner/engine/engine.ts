import { isNaturalParticipant } from './types'
import { recomputeSkillPointMax } from './skill-point-max'
import {
  accumulateSkillPointTotals,
  emptySkillPointTotals,
  summarizeSkillPoints,
} from './skill-point-summary'
import {
  paySkillPoints,
  restoreSkillPoints,
  refillSkillPoints,
  skillPointStorageRecord,
  usesSkillPoints,
  validActionSkill,
} from './skill-points'
import { phaseOperations } from './effect-config'
import { pendingCycleBoundary } from './cycle'
import { applyOperations, spawnParticipant } from './operations'
import {
  advanceTime,
  assertState,
  cloneState,
  cloneActionChanges,
  effectiveSpeed,
  fail,
  finite,
  FULL_AG,
  nextAnchor,
  orderedParticipants,
  queueSnapshot,
  anchorKey,
  SimulationError,
} from './queue'
import { participantCatalog, validateOperations, validatePlan } from './validation'
import type {
  ActionSkill,
  ParticipantNodeRecord,
  SkillPointMaxChange,
  NaturalParticipantState,
  Diagnostic,
  EffectOperation,
  EventAnchor,
  NodeRecord,
  SimulationPlan,
  SimulationResult,
  SimulationState,
  ParticipantState,
  ParticipantAnchor,
  PendingCycleBoundary,
} from './types'

export { applyOperations } from './operations'
export {
  anchorKey,
  cloneState,
  countdownParticipantId,
  DEFAULT_LIMITS,
  defaultAhaConfig,
  effectiveSpeed,
  FULL_AG,
  HARD_LIMITS,
  modifierId,
  nextAnchor,
  orderedParticipants,
  queueSnapshot,
  spawnedParticipantId,
} from './queue'
export { participantCatalog, validateOperations, validatePlan } from './validation'

export function createInitialState(plan: SimulationPlan): SimulationState {
  const errors = validatePlan(plan)
  if (errors.length) throw new SimulationError(errors[0])
  const state: SimulationState = {
    ...(plan.cycleMode === 'none'
      ? {}
      : { cycle: { mode: plan.cycleMode, nextOrdinal: 1, maxAV: plan.maxAV } }),
    ...(plan.skillPoints?.enabled
      ? {
          skillPoints: {
            current: plan.skillPoints.initial ?? 3,
            baseMax: plan.skillPoints.max ?? 5,
            max: plan.skillPoints.max ?? 5,
            stored: 0,
            storedMax: plan.skillPoints.storedMax ?? 10,
            onInsufficient: plan.skillPoints.onInsufficient ?? 'stop',
            maxModifiers: (plan.skillPoints.maxModifiers ?? []).map((modifier) => ({
              ...modifier,
            })),
            conditionalCooldowns: new Map<string, number>(),
          },
        }
      : {}),
    participants: [],
    elapsedAV: 0,
    completedNodes: 0,
    completedActions: 0,
    batch: 0,
    nextOrder: 0,
    issuedParticipantIds: new Set(),
  }
  const actors = [...plan.actors].sort(
    (a, b) =>
      (a.camp === b.camp ? 0 : a.camp === 'ally' ? -1 : 1) ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  )
  for (const actor of actors) spawnParticipant(state, actor.id, actor)
  state.issuedParticipantIds.add(plan.aha.id)
  if (plan.aha.contributorIds.length)
    state.participants.push({
      ...plan.aha,
      contributorIds: [...plan.aha.contributorIds],
      kind: 'aha',
      name: 'Aha Instant',
      camp: 'neutral',
      turns: 0,
      departed: false,
      modifiers: [],
      remainingAG: FULL_AG,
      order: state.nextOrder++,
      zeroBatch: 0,
      zeroOrder: 0,
      pendingActionChanges: [],
    })
  recomputeSkillPointMax(state, 'initial')
  return state
}
/** Shared by execution and post-action previews; expiry follows the complete post-action phase. */
function finishNaturalTurn(state: SimulationState, participant: NaturalParticipantState): void {
  participant.turns++
  participant.remainingAG = FULL_AG
  participant.zeroBatch = 0
  participant.zeroOrder = 0
  delete state.activeParticipantId
}
function settleNaturalParticipant(
  state: SimulationState,
  id: string,
  oldModifiers: ReadonlySet<string>,
): SkillPointMaxChange | undefined {
  const natural = state.participants.find(
    (participant): participant is NaturalParticipantState =>
      participant.id === id && isNaturalParticipant(participant),
  )!
  natural.modifiers = natural.modifiers.filter((buff) => {
    if (buff.lifetime.kind === 'countdown' || buff.lifetime.remainingTurns === null) return true
    if (oldModifiers.has(buff.id)) buff.lifetime.remainingTurns--
    return buff.lifetime.remainingTurns > 0
  })
  // Do not reset AG or insertion priority during expiry.
  assertState(state)
  if (
    natural.kind === 'actor' &&
    natural.actionLimit != null &&
    natural.turns >= natural.actionLimit
  )
    state.participants = state.participants.filter((participant) => participant.id !== id)
  assertState(state)
  state.completedActions++
  return recomputeSkillPointMax(state, 'removal', undefined, id)
}
function expireCountdown(state: SimulationState, id: string): void {
  for (const participant of state.participants)
    if (isNaturalParticipant(participant))
      participant.modifiers = participant.modifiers.filter(
        (buff) => buff.lifetime.kind !== 'countdown' || buff.lifetime.participantId !== id,
      )
  // Invalid expiry stops this node before its operations can mask the failure.
  assertState(state)
}
export function nextSimulationEvent(state: SimulationState):
  | {
      kind: 'participant'
      participant: ParticipantState
      anchor: ParticipantAnchor
      deltaAV: number
    }
  | { kind: 'cycleBoundary'; anchor: PendingCycleBoundary['anchor']; deltaAV: number }
  | undefined {
  const participant = orderedParticipants(state)[0]
  const boundary = pendingCycleBoundary(state)
  const deltaAV = participant
    ? finite(participant.remainingAG / effectiveSpeed(participant, state))
    : undefined
  // Compare remaining time at full precision. Re-evaluate after every ordinary event.
  if (participant && deltaAV !== undefined && (!boundary || deltaAV <= boundary.remainingAV))
    return { kind: 'participant', participant, anchor: nextAnchor(participant), deltaAV }
  return boundary
    ? { kind: 'cycleBoundary', anchor: boundary.anchor, deltaAV: boundary.remainingAV }
    : undefined
}

export function stepSimulation(
  input: SimulationState,
  operations: readonly EffectOperation[],
  skill?: ActionSkill,
): { state: SimulationState; record: NodeRecord; diagnostics: Diagnostic[]; blocked?: boolean } {
  let state = cloneState(input)
  const event = nextSimulationEvent(state)
  if (!event) fail('invalid-input')
  const anchor = event.anchor
  if (skill !== undefined && (anchor.kind !== 'action' || !validActionSkill(skill)))
    fail('invalid-input')
  const errors = validateOperations(
    operations,
    anchor,
    skill,
    event.kind === 'participant' ? event.participant : undefined,
  )
  if (errors.length) throw new SimulationError(errors[0])
  if (event.kind === 'cycleBoundary') {
    try {
      advanceTime(state, event.deltaAV)
      const record: NodeRecord = {
        kind: 'cycleBoundary',
        anchor: event.anchor,
        elapsedAV: state.elapsedAV,
        deltaAV: event.deltaAV,
        beforeEffects: cloneState(state),
        actionChanges: [],
        ...(state.skillPoints
          ? {
              skillPointStorage: skillPointStorageRecord(state.skillPoints, []),
              spValidation:
                state.skillPoints.current === null
                  ? ('unknown' as const)
                  : state.skillPoints.unverified
                    ? ('unverified' as const)
                    : ('known' as const),
            }
          : {}),
      }
      const applied = applyOperations(state, operations, anchor)
      state = applied.state
      if (applied.maxChanges) record.maxChanges = applied.maxChanges
      if (state.skillPoints)
        record.skillPointStorage = skillPointStorageRecord(state.skillPoints, [])
      state.cycle!.nextOrdinal++
      state.completedNodes++
      return { state, record, diagnostics: applied.diagnostics }
    } catch (error) {
      if (error instanceof SimulationError)
        throw new SimulationError({ ...error.diagnostic, anchor })
      throw error
    }
  }
  const active = event.participant
  const speed = effectiveSpeed(active, state)
  const deltaAV = finite(active.remainingAG / speed)
  const oldModifiers = new Set(
    isNaturalParticipant(active) ? active.modifiers.map((buff) => buff.id) : [],
  )
  const actionChanges = cloneActionChanges(active.pendingActionChanges)
  active.pendingActionChanges = []
  advanceTime(state, deltaAV)
  active.remainingAG = 0
  state.activeParticipantId = active.id
  try {
    if (active.kind === 'scheduledEvent') expireCountdown(state, active.id)
    const record: NodeRecord = {
      id: active.id,
      kind: active.kind,
      name: active.name,
      iconUrl: active.iconUrl,
      ...(isNaturalParticipant(active) ? { camp: active.camp } : {}),
      anchor: event.anchor,
      elapsedAV: state.elapsedAV,
      deltaAV,
      effectiveSpeed: speed,
      actionChanges,
      beforeEffects: cloneState(state),
      ...(state.skillPoints
        ? {
            spValidation:
              state.skillPoints.current === null
                ? ('unknown' as const)
                : state.skillPoints.unverified
                  ? ('unverified' as const)
                  : ('known' as const),
          }
        : {}),
    }
    let diagnostics: Diagnostic[]
    if (isNaturalParticipant(active)) {
      const preResources = applyOperations(
        state,
        phaseOperations(operations, 'preAction').filter(
          (operation) => operation.type === 'restoreSkillPoints',
        ),
        anchor,
        { skill },
      )
      state = preResources.state
      if (preResources.skillPointEvents)
        record.skillPointEvents = [...preResources.skillPointEvents]
      if (state.skillPoints && usesSkillPoints(active)) {
        record.skillPoints = paySkillPoints(state.skillPoints, skill)
        record.spValidation = record.skillPoints.status
        if (
          record.skillPoints.status === 'insufficient' &&
          state.skillPoints.onInsufficient !== 'mark'
        ) {
          if (record.skillPointEvents)
            record.skillPointEvents = record.skillPointEvents.map((event) => ({
              ...event,
              committed: false,
            }))
          if (input.skillPoints)
            record.skillPointStorage = skillPointStorageRecord(input.skillPoints, [])
          return {
            state: cloneState(input),
            record,
            blocked: true,
            diagnostics: [
              ...preResources.diagnostics,
              { code: 'sp-insufficient', severity: 'error', anchor },
            ],
          }
        }
      }
      const before = applyOperations(
        state,
        phaseOperations(operations, 'preAction').filter(
          (operation) => operation.type !== 'restoreSkillPoints',
        ),
        anchor,
        { skill },
      )
      state = before.state
      const actor = state.participants.find(
        (participant): participant is NaturalParticipantState =>
          participant.id === active.id && isNaturalParticipant(participant),
      )!
      finishNaturalTurn(state, actor)
      if (record.skillPoints && state.skillPoints)
        restoreSkillPoints(state.skillPoints, record.skillPoints)
      const after = applyOperations(state, phaseOperations(operations, 'postAction'), anchor, {
        skill,
      })
      state = after.state
      if (after.skillPointEvents)
        record.skillPointEvents = [...(record.skillPointEvents ?? []), ...after.skillPointEvents]
      if (after.conditionalRestores) record.conditionalRestores = after.conditionalRestores
      if (state.skillPoints && usesSkillPoints(active)) {
        const refill = refillSkillPoints(state.skillPoints)
        if (refill) record.refill = refill
      }
      const removalChange = settleNaturalParticipant(state, active.id, oldModifiers)
      const maxChanges = [
        ...(before.maxChanges ?? []),
        ...(after.maxChanges ?? []),
        ...(removalChange ? [removalChange] : []),
      ]
      if (maxChanges.length) record.maxChanges = maxChanges
      diagnostics = [...preResources.diagnostics, ...before.diagnostics, ...after.diagnostics]
      if (removalChange?.loss)
        diagnostics.push({
          code: 'sp-cap-loss',
          severity: 'warning',
          anchor,
          participantId: active.id,
        })
    } else {
      const triggered = applyOperations(state, operations, anchor)
      state = triggered.state
      if (triggered.maxChanges) record.maxChanges = triggered.maxChanges
      state.participants = state.participants.filter((participant) => participant.id !== active.id)
      delete state.activeParticipantId
      diagnostics = triggered.diagnostics
    }
    if (record.skillPoints) {
      if (record.skillPoints.status === 'insufficient')
        diagnostics.push({ code: 'sp-marked', severity: 'warning', anchor })
      if (record.skillPoints.status === 'unknown' && record.skillPoints.before !== null)
        diagnostics.push({ code: 'sp-unknown', severity: 'warning', anchor })
      if (record.skillPoints.overflow)
        diagnostics.push({ code: 'sp-overflow', severity: 'info', anchor })
    }
    if (state.skillPoints)
      record.skillPointStorage = skillPointStorageRecord(
        state.skillPoints,
        [...(record.skillPointEvents ?? []), ...(record.conditionalRestores ?? [])],
        record.skillPoints ? (record.skillPoints.overflow ?? null) : 0,
      )
    state.completedNodes++
    return { state, record, diagnostics }
  } catch (error) {
    if (error instanceof SimulationError) throw new SimulationError({ ...error.diagnostic, anchor })
    throw error
  }
}
export function simulatePlan(plan: SimulationPlan): SimulationResult {
  const result: SimulationResult = {
    records: [],
    snapshots: [],
    participants: [],
    diagnostics: validatePlan(plan),
    stopReason: 'error',
  }
  if (result.diagnostics.length) return result
  result.participants = participantCatalog(plan)
  let finalState: SimulationState | undefined
  let skillPointTotals = emptySkillPointTotals
  let candidateAnchor: EventAnchor = { kind: 'start' }
  const reached = new Set<string>()
  const events = new Map(plan.events.map((event) => [anchorKey(event.anchor), event]))
  try {
    let state = createInitialState(plan)
    finalState = state
    result.startState = cloneState(state)
    reached.add('start')
    const initial = applyOperations(state, events.get('start')?.operations ?? [], candidateAnchor)
    if (initial.state.skillPoints)
      skillPointTotals = accumulateSkillPointTotals(skillPointTotals, initial)
    state = initial.state
    finalState = state
    if (initial.skillPointEvents) result.startSkillPointEvents = initial.skillPointEvents
    if (initial.maxChanges) result.startMaxChanges = initial.maxChanges
    result.diagnostics.push(...initial.diagnostics)
    result.snapshots.push(queueSnapshot(state))
    result.stopReason = 'nodes'
    if (!state.participants.length)
      result.diagnostics.push({ code: 'no-participants', severity: 'info' })
    while (state.completedNodes < plan.maxNodes) {
      const next = nextSimulationEvent(state)
      if (!next) {
        result.stopReason = 'empty'
        break
      }
      if (finite(state.elapsedAV + next.deltaAV) > plan.maxAV) {
        result.stopReason = 'av'
        break
      }
      const anchor = next.anchor
      candidateAnchor = anchor
      const planned = events.get(anchorKey(anchor))
      const step = stepSimulation(state, planned?.operations ?? [], planned?.skill)
      if (step.blocked) {
        reached.add(anchorKey(anchor))
        result.blockedAction = step.record as ParticipantNodeRecord
        result.diagnostics.push(...step.diagnostics)
        result.stopReason = 'error'
        break
      }
      const snapshot = queueSnapshot(step.state)
      if (step.state.skillPoints)
        skillPointTotals = accumulateSkillPointTotals(skillPointTotals, step.record)
      state = step.state
      finalState = state
      reached.add(anchorKey(anchor))
      result.records.push(step.record)
      result.snapshots.push(snapshot)
      result.diagnostics.push(...step.diagnostics)
    }
    if (!state.participants.length && !pendingCycleBoundary(state)) result.stopReason = 'empty'
  } catch (error) {
    if (!(error instanceof SimulationError)) throw error
    result.stopReason = 'error'
    const { diagnostic } = error
    result.diagnostics.push(
      diagnostic.code === 'sp-arithmetic' && !diagnostic.anchor
        ? { ...diagnostic, anchor: candidateAnchor }
        : diagnostic,
    )
  }
  if (finalState?.skillPoints)
    result.skillPointsSummary = summarizeSkillPoints(
      result,
      finalState.skillPoints,
      skillPointTotals,
    )
  for (const event of plan.events)
    if (
      (event.operations.length || event.skill) &&
      !reached.has(anchorKey(event.anchor)) &&
      !(event.anchor.kind === 'cycleBoundary' && plan.cycleMode === 'none')
    )
      result.diagnostics.push({
        code: 'unreached-anchor',
        severity: 'warning',
        anchor: event.anchor,
      })
  return result
}

/** Replay only the operations preceding a draft, using the same engine as execution. */
export function previewOperationState(
  input: SimulationState,
  operations: readonly EffectOperation[],
  anchor: EventAnchor,
  phase: 'preAction' | 'postAction',
  beforeId?: string,
  skill?: ActionSkill,
  resourceDraft = false,
): SimulationState | undefined {
  try {
    let state = cloneState(input)
    const group = anchor.kind === 'action' ? phaseOperations(operations, phase) : operations
    const index = group.findIndex((op) => op.id === beforeId)
    const preceding = index < 0 ? group : group.slice(0, index)
    if (anchor.kind === 'action') {
      const resource = (op: EffectOperation) => op.type === 'restoreSkillPoints'
      if (phase === 'preAction' && resourceDraft)
        return applyOperations(state, preceding.filter(resource), anchor).state

      const preAction = phaseOperations(operations, 'preAction').filter((op) => op.id !== beforeId)
      state = applyOperations(state, preAction.filter(resource), anchor).state
      const actor = state.participants.find(
        (participant) => participant.id === anchor.participantId,
      )
      if (!actor || !isNaturalParticipant(actor)) return undefined
      const payment =
        state.skillPoints && usesSkillPoints(actor)
          ? paySkillPoints(state.skillPoints, skill)
          : undefined
      if (payment?.status === 'insufficient' && state.skillPoints?.onInsufficient !== 'mark')
        return undefined
      if (phase === 'preAction')
        return applyOperations(
          state,
          preceding.filter((op) => !resource(op)),
          anchor,
          { skill },
        ).state

      state = applyOperations(
        state,
        preAction.filter((op) => !resource(op)),
        anchor,
        { skill },
      ).state
      const afterPreAction = state.participants.find(
        (participant): participant is NaturalParticipantState =>
          participant.id === anchor.participantId && isNaturalParticipant(participant),
      )
      if (!afterPreAction) return undefined
      finishNaturalTurn(state, afterPreAction)
      if (payment && state.skillPoints) restoreSkillPoints(state.skillPoints, payment)
    }
    return applyOperations(state, preceding, anchor, { skill }).state
  } catch (error) {
    if (error instanceof SimulationError) return undefined
    throw error
  }
}
