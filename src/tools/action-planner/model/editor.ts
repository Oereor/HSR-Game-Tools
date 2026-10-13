import {
  applyOperations,
  createInitialState,
  stepSimulation,
  previewOperationState,
} from '../../../engine/action-planner/engine'
import {
  anchorKey,
  nextAnchor,
  orderedParticipants,
  SimulationError,
} from '../../../engine/action-planner/queue'
import {
  operationTargets,
  targetIds,
  validTargetSelection,
} from '../../../engine/action-planner/targeting'
import { validateOperations } from '../../../engine/action-planner/validation'
import type {
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationPlan,
  SimulationResult,
  SimulationState,
  Target,
} from '../../../engine/action-planner/types'
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
export interface PlannerDocument {
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
}
export function operationDraft(operation?: EffectOperation, customName = ''): OperationDraft {
  return {
    id: operation?.id || undefined,
    original: operation?.id ? operation : undefined,
    customName,
    type: operation?.type ?? 'advance',
    phase: operation?.phase ?? (operation?.id ? 'preAction' : 'postAction'),
    targetKind:
      operation && operation.type !== 'spawnParticipant' ? operation.target.kind : 'participants',
    selectedIds:
      operation && operation.type !== 'spawnParticipant' && operation.target.kind === 'participants'
        ? [...operation.target.participantIds]
        : [],
    percent: operation?.type === 'advance' || operation?.type === 'delay' ? operation.percent : 50,
    mode: operation?.type === 'addSpeedModifier' ? operation.mode : 'flat',
    amount: operation?.type === 'addSpeedModifier' ? operation.amount : 10,
    duration: speedDurationDraft(
      operation?.type === 'addSpeedModifier' ? operation.duration : undefined,
    ),
    participant: participantDraft(operation?.type === 'spawnParticipant' ? operation : undefined),
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
): SimulationState | undefined {
  if (anchor.kind === 'start' && result.startState) return result.startState
  const record = result.records.find((r) => anchorKey(r.anchor) === anchorKey(anchor))
  if (record) return record.beforeEffects
  try {
    let state = createInitialState(plan)
    if (anchor.kind === 'start') return state
    state = applyOperations(state, operationsAt(plan, { kind: 'start' }), { kind: 'start' }).state
    for (const done of result.records)
      state = stepSimulation(state, operationsAt(plan, done.anchor)).state
    const next = orderedParticipants(state)[0]
    return next && anchorKey(nextAnchor(next)) === anchorKey(anchor)
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
    ? previewOperationState(context, operations, anchor, draft.phase, draft.id)
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
    case 'spawnParticipant':
      return buildParticipantOperation(
        { ...draft.participant, phase: draft.phase },
        common.id,
        anchor,
        draft.original?.type === 'spawnParticipant' ? draft.original : undefined,
      ).operation
    case 'immediatelyAct':
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
  const operation = provisionalOperation({ ...draft, id }, anchor)!
  if (operation.type === 'spawnParticipant') return { invalid: ['form'] }
  const participants = operationTargets(preview)
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
  }
  if (!invalid.length && validateOperations([operation], anchor).length) invalid.push('form')
  return invalid.length ? { invalid } : { operation, invalid: [] }
}
