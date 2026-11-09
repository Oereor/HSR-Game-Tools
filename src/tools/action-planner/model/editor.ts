import {
  applyOperations,
  createInitialState,
  stepSimulation,
  nextSimulationEvent,
  previewOperationState,
} from '../engine/engine'
import { anchorKey, SimulationError } from '../engine/queue'
import { isSkillPointOperationType } from '../engine/effect-config'
import { characterEffectSourceIssue, validEnhancedBasicCost } from '../engine/character-effects'
import {
  isTargetedOperation,
  operationTargets,
  targetIds,
  validTargetSelection,
  validSpeedDurationForTargets,
} from '../engine/targeting'
import { validateOperations } from '../engine/validation'
import type {
  CharacterEffectId,
  EnhancedBasicCost,
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationPlan,
  SimulationResult,
  SimulationState,
  Target,
} from '../engine/types'
import {
  buildParticipantOperation,
  participantDraft,
  type ParticipantDraft,
} from './participant-config'
import {
  parseSpeedDuration,
  speedDurationDraft,
  type SpeedDurationDraft,
} from './speed-duration-config'

export interface PlannerMetadata {
  customNames: Record<string, string>
  characterIds: Record<string, string>
}
/** Imported IDs may match ordinary Object prototype members. */
export const metadataValue = (values: Record<string, string>, id: string): string | undefined =>
  Object.hasOwn(values, id) ? values[id] : undefined
export interface PlannerDocument {
  name: string
  plan: SimulationPlan
  metadata: PlannerMetadata
}
export interface OperationDraft {
  id?: string
  original?: EffectOperation
  type: EffectOperation['type']
  customName: string
  phase: EffectPhase
  targetKind: Target['kind']
  selectedIds: string[]
  percent: number | undefined
  mode: 'flat' | 'percent'
  amount: number | undefined
  duration: SpeedDurationDraft
  participant: ParticipantDraft
  effectId?: CharacterEffectId
  effectCost?: EnhancedBasicCost
  sourceParticipantId?: string
}
export function operationDraft(operation?: EffectOperation, customName = ''): OperationDraft {
  const target = operation && isTargetedOperation(operation) ? operation.target : undefined
  return {
    id: operation?.id || undefined,
    original: operation?.id ? operation : undefined,
    customName,
    type: operation?.type ?? 'advance',
    phase: operation?.phase ?? (operation?.id ? 'preAction' : 'postAction'),
    targetKind: target?.kind ?? 'participants',
    selectedIds: target?.kind === 'participants' ? [...target.participantIds] : [],
    percent: operation?.type === 'advance' || operation?.type === 'delay' ? operation.percent : 50,
    mode: operation?.type === 'addSpeedModifier' ? operation.mode : 'flat',
    amount: operation && 'amount' in operation ? operation.amount : 10,
    duration: speedDurationDraft(
      operation?.type === 'addSpeedModifier' ? operation.duration : undefined,
    ),
    participant: participantDraft(operation?.type === 'spawnParticipant' ? operation : undefined),
    ...(operation?.type === 'characterEffect'
      ? {
          effectId: operation.effectId,
          sourceParticipantId: operation.sourceParticipantId,
          effectCost: operation.cost,
        }
      : {}),
  }
}
export function operationsAt(plan: SimulationPlan, anchor: EventAnchor): EffectOperation[] {
  return plan.events.find((e) => anchorKey(e.anchor) === anchorKey(anchor))?.operations ?? []
}
/** Recover a failed node by replaying only committed successful steps through the engine. */
export function contextAt(
  plan: SimulationPlan,
  result: SimulationResult,
  anchor: EventAnchor,
  characterIds: Readonly<Record<string, string>> = {},
): SimulationState | undefined {
  if (anchor.kind === 'start' && result.startState) return result.startState
  const record = result.records.find((r) => anchorKey(r.anchor) === anchorKey(anchor))
  if (record) return record.beforeEffects
  try {
    let state = createInitialState(plan, characterIds)
    if (anchor.kind === 'start') return state
    state = applyOperations(state, operationsAt(plan, { kind: 'start' }), { kind: 'start' }).state
    const events = new Map(plan.events.map((event) => [anchorKey(event.anchor), event]))
    for (const done of result.records) {
      const event = events.get(anchorKey(done.anchor))
      state = stepSimulation(state, event?.operations ?? []).state
    }
    const next = nextSimulationEvent(state)
    return next && anchorKey(next.anchor) === anchorKey(anchor)
      ? stepSimulation(state, []).record.beforeEffects
      : undefined
  } catch (error) {
    if (error instanceof SimulationError) return undefined
    throw error
  }
}
export function previewDraft(
  context: SimulationState | undefined,
  operations: EffectOperation[],
  anchor: EventAnchor,
  draft: OperationDraft,
): SimulationState | undefined {
  return context
    ? previewOperationState(
        context,
        operations,
        anchor,
        draft.phase,
        draft.id,
        isSkillPointOperationType(draft.type),
      )
    : undefined
}
/** A provisional value is for naming only; it is never submitted without buildOperation. */
export function provisionalOperation(
  draft: OperationDraft,
  anchor: EventAnchor,
): EffectOperation | undefined {
  const common = {
    id: draft.id ?? 'draft',
    ...(anchor.kind === 'action' ? { phase: draft.phase } : {}),
  }
  const target: Target =
    draft.targetKind === 'participants'
      ? { kind: 'participants', participantIds: [...draft.selectedIds] }
      : { kind: draft.targetKind }
  switch (draft.type) {
    case 'changeSkillPoints':
      return { ...common, type: draft.type, amount: draft.amount ?? NaN }
    case 'characterEffect': {
      const { effectId, sourceParticipantId } = draft
      if (!effectId || !sourceParticipantId) return
      const effect = { ...common, type: 'characterEffect' as const, sourceParticipantId }
      if (effectId === 'imbibitorLunae.enhancedBasic')
        return validEnhancedBasicCost(draft.effectCost)
          ? { ...effect, effectId, cost: draft.effectCost }
          : undefined
      return { ...effect, effectId }
    }
    case 'spawnParticipant':
      return buildParticipantOperation(
        { ...draft.participant, phase: draft.phase },
        common.id,
        anchor,
        draft.original?.type === 'spawnParticipant' ? draft.original : undefined,
      ).operation
    case 'immediatelyAct':
    case 'depart':
    case 'returnToField':
      return { ...common, type: draft.type, target }
    case 'advance':
    case 'delay':
      return { ...common, type: draft.type, target, percent: draft.percent ?? 0 }
    case 'addSpeedModifier':
      return {
        ...common,
        type: draft.type,
        target,
        mode: draft.mode,
        amount: draft.amount ?? 0,
        duration: parseSpeedDuration(draft.duration).duration ?? { kind: 'turns', turns: null },
      }
  }
}
export function buildOperation(
  draft: OperationDraft,
  id: string,
  anchor: EventAnchor,
  preview: SimulationState | undefined,
): { operation?: EffectOperation; invalid: string[] } {
  if (draft.type === 'changeSkillPoints') {
    const operation = provisionalOperation({ ...draft, id }, anchor)!
    return validateOperations([operation], anchor).length
      ? { invalid: ['spAmount'] }
      : { operation, invalid: [] }
  }
  if (draft.type === 'characterEffect') {
    const operation = provisionalOperation({ ...draft, id }, anchor)
    if (operation?.type !== 'characterEffect' || validateOperations([operation], anchor).length)
      return { invalid: ['characterEffect'] }
    const unchangedSource =
      draft.original?.type === 'characterEffect' &&
      draft.original.effectId === operation.effectId &&
      draft.original.sourceParticipantId === operation.sourceParticipantId
    if (
      !unchangedSource &&
      (!preview?.skillPoints || characterEffectSourceIssue(preview, operation, anchor))
    )
      return { invalid: ['characterEffect'] }
    return { operation, invalid: [] }
  }
  if (!preview) return { invalid: ['context'] }
  if (draft.original?.type === 'spawnParticipant' && draft.type !== 'spawnParticipant')
    return { invalid: ['form'] }
  if (draft.type === 'spawnParticipant')
    return buildParticipantOperation(
      { ...draft.participant, phase: draft.phase },
      id,
      anchor,
      draft.original?.type === 'spawnParticipant' ? draft.original : undefined,
    )
  const invalid: string[] = []
  const operation = provisionalOperation({ ...draft, id }, anchor)
  if (!operation || !isTargetedOperation(operation)) return { invalid: ['form'] }
  const participants = operationTargets(preview, operation.type)
  const ids = targetIds(operation.target, participants)
  const selected = participants.filter((p) => ids.includes(p.id))
  if (ids.length !== selected.length || !validTargetSelection(operation.type, selected))
    invalid.push('target')
  if (
    (draft.type === 'advance' || draft.type === 'delay') &&
    (draft.percent === undefined || !Number.isFinite(draft.percent) || draft.percent < 0)
  )
    invalid.push('percent')
  if (draft.type === 'addSpeedModifier') {
    if (draft.amount === undefined || !Number.isFinite(draft.amount)) invalid.push('amount')
    invalid.push(...parseSpeedDuration(draft.duration).invalid)
    if (
      operation.type === 'addSpeedModifier' &&
      !validSpeedDurationForTargets(operation.duration, selected)
    )
      invalid.push('duration')
  }
  if (
    !invalid.length &&
    operation.type === 'addSpeedModifier' &&
    selected.some((p) => p.kind === 'scheduledEvent')
  ) {
    try {
      applyOperations(preview, [operation], anchor)
    } catch (error) {
      if (!(error instanceof SimulationError)) throw error
      invalid.push('effectiveSpeed')
    }
  }
  if (!invalid.length && validateOperations([operation], anchor).length) invalid.push('form')
  return invalid.length ? { invalid } : { operation, invalid: [] }
}
