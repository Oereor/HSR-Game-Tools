import type {
  EffectOperation,
  EventAnchor,
  EffectPhase,
  PlanEvent,
  SimulationState,
} from '../engine/types'
import { FULL_AG, anchorKey, spawnedParticipantId } from '../engine/queue'
import { operationTargets } from '../engine/targeting'
import { metadataValue, type PlannerDocument } from './editor'

export interface BatchPresetResult {
  document?: PlannerDocument
  operationIds: string[]
  invalid: string[]
}

function appendPresetEvents(document: PlannerDocument, patches: PlanEvent[]): PlannerDocument {
  const events = document.plan.events.map((event) => ({
    ...event,
    operations: [...event.operations],
  }))
  for (const patch of patches) {
    const existing = events.find((event) => anchorKey(event.anchor) === anchorKey(patch.anchor))
    if (existing) existing.operations.push(...patch.operations)
    else events.push({ anchor: { ...patch.anchor }, operations: [...patch.operations] })
  }
  return { ...document, plan: { ...document.plan, events } }
}

export interface RobinPresetInput {
  name: string
}

export type RobinPresetIssue =
  'context' | 'missing' | 'ambiguous' | 'departed' | 'unavailable' | 'activeAlly'

/** Eligibility at the insertion point, shared by the UI and submission. */
export function robinPresetAvailability(
  document: PlannerDocument,
  preview: SimulationState | undefined,
): { participantId?: string; hasOtherAllies?: boolean; issue?: RobinPresetIssue } {
  if (!preview) return { issue: 'context' }
  const robins = document.plan.actors.filter(
    (actor) =>
      actor.camp === 'ally' && metadataValue(document.metadata.characterIds, actor.id) === '1309',
  )
  if (!robins.length) return { issue: 'missing' }
  if (robins.length !== 1) return { issue: 'ambiguous' }
  const robin = preview.participants.find(
    (participant) => participant.id === robins[0]!.id && participant.kind === 'actor',
  )
  if (!robin) return { issue: 'unavailable' }
  if (robin.departed) return { issue: 'departed' }
  const allies = operationTargets(preview, 'immediatelyAct').filter(
    (participant) =>
      participant.kind === 'actor' && participant.camp === 'ally' && participant.id !== robin.id,
  )
  if (allies.some((participant) => participant.id === preview.activeParticipantId))
    return { issue: 'activeAlly' }
  return { participantId: robin.id, hasOtherAllies: allies.length > 0 }
}

/** Ordinary operations only; the countdown's trigger anchor follows its stable spawn identity. */
export function buildRobinPreset(
  document: PlannerDocument,
  anchor: EventAnchor,
  phase: EffectPhase,
  preview: SimulationState | undefined,
  input: RobinPresetInput,
  nextId: () => string,
): BatchPresetResult {
  const available = robinPresetAvailability(document, preview)
  if (available.issue) return { invalid: [`robin:${available.issue}`], operationIds: [] }
  if (!input.name.trim()) return { invalid: ['form'], operationIds: [] }
  const operationIds: string[] = []
  const id = () => {
    const value = nextId()
    operationIds.push(value)
    return value
  }
  const target = () => ({
    kind: 'participants' as const,
    participantIds: [available.participantId!],
  })
  const common = anchor.kind === 'action' ? { phase } : {}
  const operations: EffectOperation[] = [{ id: id(), type: 'depart', target: target(), ...common }]
  if (available.hasOtherAllies)
    operations.push({ id: id(), type: 'immediatelyAct', target: { kind: 'allies' }, ...common })
  const spawnId = id()
  operations.push({
    id: spawnId,
    type: 'spawnParticipant',
    ...common,
    participant: {
      kind: 'scheduledEvent',
      name: input.name.trim(),
      speed: 90,
      initialAG: FULL_AG,
    },
  })
  return {
    document: appendPresetEvents(document, [
      { anchor, operations },
      {
        anchor: { kind: 'trigger', participantId: spawnedParticipantId(spawnId) },
        operations: [
          { id: id(), type: 'returnToField', target: target() },
          { id: id(), type: 'immediatelyAct', target: target() },
        ],
      },
    ]),
    operationIds,
    invalid: [],
  }
}

export interface FireflyPresetInput {
  spd: number | undefined
  countdownName: string
}

export type FireflyPresetIssue =
  'context' | 'missing' | 'ambiguous' | 'departed' | 'unavailable' | 'activeTarget'

/** Resolve character identity against the actual insertion preview, not the final catalog. */
export function fireflyPresetAvailability(
  document: PlannerDocument,
  preview: SimulationState | undefined,
): { participantId?: string; issue?: FireflyPresetIssue } {
  if (!preview) return { issue: 'context' }
  const fireflies = document.plan.actors.filter(
    (actor) =>
      actor.camp === 'ally' && metadataValue(document.metadata.characterIds, actor.id) === '1310',
  )
  if (!fireflies.length) return { issue: 'missing' }
  if (fireflies.length !== 1) return { issue: 'ambiguous' }
  const firefly = preview.participants.find(
    (participant) => participant.id === fireflies[0]!.id && participant.kind === 'actor',
  )
  if (!firefly) return { issue: 'unavailable' }
  if (firefly.departed) return { issue: 'departed' }
  if (!operationTargets(preview, 'advance').some((participant) => participant.id === firefly.id))
    return { issue: 'unavailable' }
  if (firefly.id === preview.activeParticipantId) return { issue: 'activeTarget' }
  return { participantId: firefly.id }
}

/** The speed operation owns its countdown; the advance keeps ordinary 100% AG semantics. */
export function buildFireflyPreset(
  document: PlannerDocument,
  anchor: EventAnchor,
  phase: EffectPhase,
  preview: SimulationState | undefined,
  input: FireflyPresetInput,
  nextId: () => string,
): BatchPresetResult {
  const available = fireflyPresetAvailability(document, preview)
  if (available.issue) return { invalid: [`firefly:${available.issue}`], operationIds: [] }
  if (input.spd === undefined || !Number.isFinite(input.spd) || input.spd < 0)
    return { invalid: ['spd'], operationIds: [] }
  if (!input.countdownName.trim()) return { invalid: ['form'], operationIds: [] }
  const operationIds = [nextId(), nextId()]
  const target = { kind: 'participants' as const, participantIds: [available.participantId!] }
  const common = anchor.kind === 'action' ? { phase } : {}
  const operations: EffectOperation[] = [
    {
      id: operationIds[0]!,
      type: 'addSpeedModifier',
      target,
      mode: 'flat',
      amount: input.spd,
      duration: { kind: 'countdown', name: input.countdownName.trim(), speed: 70 },
      ...common,
    },
    {
      id: operationIds[1]!,
      type: 'advance',
      target: { ...target, participantIds: [...target.participantIds] },
      percent: 100,
      ...common,
    },
  ]
  return {
    document: appendPresetEvents(document, [{ anchor, operations }]),
    operationIds,
    invalid: [],
  }
}

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
): BatchPresetResult {
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
  return {
    document: appendPresetEvents(document, patches),
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
