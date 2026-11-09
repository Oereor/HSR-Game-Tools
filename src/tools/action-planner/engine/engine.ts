import { isNaturalParticipant } from './types'
import { isSkillPointOperation, orderOperations, phaseOperations } from './effect-config'
import { initialCharacterEffects } from './character-effects'
import { DEFAULT_SKILL_POINTS } from './skill-points'
import { pendingCycleBoundary } from './cycle'
import { applyOperations, spawnParticipant, type OperationSettlement } from './operations'
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
  NaturalParticipantState,
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

export function createInitialState(
  plan: SimulationPlan,
  characterIds: Readonly<Record<string, string>> = {},
): SimulationState {
  const errors = validatePlan(plan)
  if (errors.length) throw new SimulationError(errors[0])
  const state: SimulationState = {
    ...(plan.cycleMode === 'none'
      ? {}
      : { cycle: { mode: plan.cycleMode, nextOrdinal: 1, maxAV: plan.maxAV } }),
    ...(plan.skillPoints?.enabled
      ? {
          skillPoints: {
            current: BigInt(plan.skillPoints.initial ?? DEFAULT_SKILL_POINTS.initial),
            max: plan.skillPoints.max ?? DEFAULT_SKILL_POINTS.max,
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
  if (state.skillPoints) {
    const effects = initialCharacterEffects(actors, characterIds)
    if (effects.size) state.characterEffects = effects
  }
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
): void {
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
): OperationSettlement & { record: NodeRecord } {
  let state = cloneState(input)
  const event = nextSimulationEvent(state)
  if (!event) fail('invalid-input')
  const anchor = event.anchor
  const errors = validateOperations(operations, anchor)
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
      }
      const applied = applyOperations(state, operations, anchor)
      state = applied.state
      state.cycle!.nextOrdinal++
      state.completedNodes++
      return { ...applied, state, record }
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
    }
    let settlement: OperationSettlement
    if (isNaturalParticipant(active)) {
      const before = applyOperations(state, phaseOperations(operations, 'preAction'), anchor)
      state = before.state
      const actor = state.participants.find(
        (participant): participant is NaturalParticipantState =>
          participant.id === active.id && isNaturalParticipant(participant),
      )!
      finishNaturalTurn(state, actor)
      const after = applyOperations(state, phaseOperations(operations, 'postAction'), anchor)
      state = after.state
      settleNaturalParticipant(state, active.id, oldModifiers)
      const warned = before.diagnostics.some((issue) => issue.code === 'sp-negative')
      settlement = {
        state,
        diagnostics: [
          ...before.diagnostics,
          ...after.diagnostics.filter((issue) => issue.code !== 'sp-negative' || !warned),
        ],
        characterEffectOutcomes: [
          ...before.characterEffectOutcomes,
          ...after.characterEffectOutcomes,
        ],
      }
    } else {
      const triggered = applyOperations(state, operations, anchor)
      state = triggered.state
      state.participants = state.participants.filter((participant) => participant.id !== active.id)
      delete state.activeParticipantId
      settlement = triggered
    }
    state.completedNodes++
    return { ...settlement, record }
  } catch (error) {
    if (error instanceof SimulationError) throw new SimulationError({ ...error.diagnostic, anchor })
    throw error
  }
}
export function simulatePlan(
  plan: SimulationPlan,
  characterIds: Readonly<Record<string, string>> = {},
): SimulationResult {
  const result: SimulationResult = {
    records: [],
    snapshots: [],
    participants: [],
    diagnostics: validatePlan(plan),
    characterEffectOutcomes: [],
    stopReason: 'error',
  }
  if (result.diagnostics.length) return result
  result.participants = participantCatalog(plan)
  const reached = new Set<string>()
  const events = new Map(plan.events.map((event) => [anchorKey(event.anchor), event]))
  try {
    let state = createInitialState(plan, characterIds)
    result.startState = cloneState(state)
    reached.add('start')
    const initial = applyOperations(state, events.get('start')?.operations ?? [], { kind: 'start' })
    state = initial.state
    result.diagnostics.push(...initial.diagnostics)
    result.characterEffectOutcomes.push(...initial.characterEffectOutcomes)
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
      const planned = events.get(anchorKey(anchor))
      const step = stepSimulation(state, planned?.operations ?? [])
      const snapshot = queueSnapshot(step.state)
      state = step.state
      reached.add(anchorKey(anchor))
      result.records.push(step.record)
      result.snapshots.push(snapshot)
      result.diagnostics.push(...step.diagnostics)
      result.characterEffectOutcomes.push(...step.characterEffectOutcomes)
    }
    if (!state.participants.length && !pendingCycleBoundary(state)) result.stopReason = 'empty'
  } catch (error) {
    if (!(error instanceof SimulationError)) throw error
    result.stopReason = 'error'
    result.diagnostics.push(error.diagnostic)
  }
  const firstNegative = result.diagnostics.find((issue) => issue.code === 'sp-negative')
  if (firstNegative) firstNegative.code = 'sp-negative-first'
  for (const event of plan.events)
    if (
      event.operations.length &&
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
  skillPointDraft = false,
): SimulationState | undefined {
  try {
    let state = cloneState(input)
    const group = orderOperations(
      anchor.kind === 'action' ? phaseOperations(operations, phase) : operations,
    )
    const index = group.findIndex((op) => op.id === beforeId)
    const preceding =
      index >= 0
        ? group.slice(0, index)
        : skillPointDraft
          ? group.filter(isSkillPointOperation)
          : group
    if (anchor.kind === 'action' && phase === 'postAction') {
      const preAction = phaseOperations(operations, 'preAction').filter((op) => op.id !== beforeId)
      state = applyOperations(state, preAction, anchor).state
      const actor = state.participants.find(
        (participant): participant is NaturalParticipantState =>
          participant.id === anchor.participantId && isNaturalParticipant(participant),
      )
      if (!actor) return undefined
      finishNaturalTurn(state, actor)
    }
    return applyOperations(state, preceding, anchor).state
  } catch (error) {
    if (error instanceof SimulationError) return undefined
    throw error
  }
}
