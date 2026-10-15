import type { EffectOperation, EventAnchor, EffectPhase, SimulationState } from '../engine/types'
import { FULL_AG, anchorKey, spawnedParticipantId } from '../engine/queue'
import { operationTargets } from '../engine/targeting'
import type { PlannerDocument } from './editor'

export interface KhaslanaPresetInput {
  baseSpeed: number | undefined
  inheritancePercent: number | undefined
  names: string[]
}

/** Tool-only builder: after creation every effect is an independent ordinary operation. */
export function buildKhaslanaPreset(
  document: PlannerDocument,
  anchor: EventAnchor,
  phase: EffectPhase,
  preview: SimulationState | undefined,
  input: KhaslanaPresetInput,
  nextId: () => string,
): { document?: PlannerDocument; operationIds: string[]; invalid: string[] } {
  const invalid: string[] = []
  const positive = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value > 0
  if (!positive(input.baseSpeed)) invalid.push('baseSpeed')
  if (!positive(input.inheritancePercent)) invalid.push('inheritancePercent')
  const speed = (input.baseSpeed ?? 0) * ((input.inheritancePercent ?? 0) / 100)
  if (!positive(speed) && !invalid.length) invalid.push('speed')
  if (input.names.length !== 8 || input.names.some((name) => !name.trim())) invalid.push('form')
  if (!preview) invalid.push('context')
  const participantIds = operationTargets(preview, 'depart')
    .filter((p) => p.kind === 'actor' && p.camp === 'ally')
    .map((p) => p.id)
  if (preview && !participantIds.length) invalid.push('target')
  if (invalid.length) return { invalid, operationIds: [] }
  const operationIds = Array.from({ length: 10 }, nextId)
  const common = anchor.kind === 'action' ? { phase } : {}
  const operations: EffectOperation[] = operationIds.slice(0, 8).map((id, index) => ({
    id,
    type: 'spawnParticipant',
    ...common,
    participant: {
      kind: 'scheduledEvent',
      name: input.names[index]!,
      baseSpeed: input.baseSpeed!,
      speed,
      initialAG: (index * FULL_AG) / 7,
    },
  }))
  const target = { kind: 'participants' as const, participantIds }
  operations.push({ id: operationIds[8]!, type: 'depart', target, ...common })
  const finalAnchor: EventAnchor = {
    kind: 'trigger',
    participantId: spawnedParticipantId(operationIds[7]!),
  }
  const patches = [
    { anchor, operations },
    {
      anchor: finalAnchor,
      operations: [
        {
          id: operationIds[9]!,
          type: 'returnToField' as const,
          target: { ...target, participantIds: [...participantIds] },
        },
      ],
    },
  ]
  let events = document.plan.events.map((event) => ({
    ...event,
    operations: [...event.operations],
  }))
  for (const patch of patches) {
    const existing = events.find((event) => anchorKey(event.anchor) === anchorKey(patch.anchor))
    if (existing) existing.operations.push(...patch.operations)
    else events = [...events, { anchor: { ...patch.anchor }, operations: patch.operations }]
  }
  return {
    document: { ...document, plan: { ...document.plan, events } },
    operationIds,
    invalid: [],
  }
}

export type PresetKind = 'vonwacq' | 'eagle' | 'dance'
/** Form templates only. No preset identity is included in the engine operation. */
export function presetOperation(
  kind: PresetKind,
  id: string,
  participantId: string,
): EffectOperation {
  return {
    id,
    type: 'advance',
    target:
      kind === 'dance'
        ? { kind: 'allies' }
        : { kind: 'participants', participantIds: [participantId] },
    percent: kind === 'vonwacq' ? 40 : kind === 'eagle' ? 25 : 24,
  }
}
export function canUseVonwacq(anchor: EventAnchor): boolean {
  return anchor.kind === 'start'
}
