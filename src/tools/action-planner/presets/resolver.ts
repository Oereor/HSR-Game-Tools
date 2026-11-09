import { applyOperations } from '../engine/operations'
import { previewOperationState, simulatePlan } from '../engine/engine'
import { characterEffectSourceIssue } from '../engine/character-effects'
import { isSkillPointOperation } from '../engine/effect-config'
import {
  anchorKey,
  countdownParticipantId,
  spawnedParticipantId,
  SimulationError,
} from '../engine/queue'
import { isTargetedOperation, operationTargets, targetIds } from '../engine/targeting'
import { validateOperations } from '../engine/validation'
import type { ActorConfig, EffectOperation, EventAnchor, PlanEvent, Target } from '../engine/types'
import { metadataValue, operationsAt } from '../model/editor'
import { referencedIds } from '../model/document-file'
import type { CharacterRecord } from '../data/schema'
import {
  collectInputs,
  isCharacterEffectPreset,
  PresetError,
  reusableSkillPointCosts,
  supportsSkillPointCostReuse,
  valueResolver,
} from './values'
import {
  PRESET_LIMITS,
  type PresetContext,
  type PresetDefinition,
  type PresetOperation,
  type PresetResult,
  type PresetTarget,
} from './types'

/** No Vue, localization singleton, filesystem or preset identity branches. */
export function compilePreset(
  definition: PresetDefinition,
  context: PresetContext,
  characters: readonly CharacterRecord[],
  nextId: () => string,
): PresetResult {
  let operationIndex: number | undefined, semanticTarget: PresetTarget | undefined
  const parameters = new Set<string>()
  try {
    const { anchor: insertionAnchor, beforeEffects, reuseSkillPointCostId } = context
    const existing = operationsAt(context.document.plan, insertionAnchor)
    const characterPreset = isCharacterEffectPreset(definition)
    const costs = supportsSkillPointCostReuse(definition) ? reusableSkillPointCosts(existing) : []
    const reusedCost = costs.find((op) => op.id === reuseSkillPointCostId)
    const phase = reusedCost?.phase ?? context.phase
    const preview =
      characterPreset && beforeEffects
        ? previewOperationState(beforeEffects, existing, insertionAnchor, phase, undefined, true)
        : phase === context.phase
          ? context.preview
          : undefined
    if (!preview) throw new PresetError('context')
    if (characterPreset && !preview.skillPoints) throw new PresetError('skillPointTracking')
    if (definition.startOnly && insertionAnchor.kind !== 'start') throw new PresetError('startOnly')
    for (const input of collectInputs(definition)) parameters.add(input.id)
    let self: string | undefined
    let selfActor: ActorConfig | undefined
    if (definition.characterId) {
      const actors = context.document.plan.actors.filter(
        (actor) =>
          actor.camp === 'ally' &&
          metadataValue(context.document.metadata.characterIds, actor.id) ===
            definition.characterId,
      )
      if (!actors.length) throw new PresetError('missing')
      if (actors.length !== 1) throw new PresetError('ambiguous')
      const participant = preview.participants.find(
        (p) => p.id === actors[0]!.id && p.kind === 'actor',
      )
      if (!participant) throw new PresetError('unavailable')
      if (definition.selfPresence === 'present' && participant.departed)
        throw new PresetError('departed')
      if (definition.selfPresence === 'departed' && !participant.departed)
        throw new PresetError('unavailable')
      self = participant.id
      selfActor = actors[0]!
    }
    const bronyaRefund = definition.operations.some(
      (op) => op.type === 'characterEffect' && op.effectId === 'bronya.e1.refund',
    )
    if (
      bronyaRefund &&
      (insertionAnchor.kind !== 'action' || insertionAnchor.participantId !== self)
    )
      throw new PresetError('characterEffectAnchor')
    if ((costs.length || reuseSkillPointCostId !== undefined) && !reusedCost)
      throw new PresetError('skillPointCost')
    const values = valueResolver(
      definition,
      characters,
      context.translate,
      context.values,
      selfActor,
    )
    const snapshots = new Map<string, string[]>()
    for (const [name, spec] of Object.entries(definition.snapshots ?? {})) {
      const ids = targetIds({ kind: spec.target }, operationTargets(preview, spec.operation))
      if (!ids.length) throw new PresetError('target')
      snapshots.set(name, ids)
    }
    function target(value: PresetTarget): Target {
      if (value === 'allies' || value === 'enemies') return { kind: value }
      const ids =
        value === 'self'
          ? self
            ? [self]
            : []
          : value === 'selected'
            ? (context.selectedIds ?? [])
            : snapshots.get(value.snapshot)
      if (!ids?.length) throw new PresetError('target')
      return { kind: 'participants', participantIds: [...ids] }
    }
    // First create and check a complete candidate with temporary identities. Real IDs
    // are reserved only after defaults, fields and the insertion context are valid.
    const patches: PlanEvent[] = []
    const optional = new Set<string>()
    let serial = 0,
      count = 0
    const reserved = referencedIds(context.document.plan)
    function probeId() {
      let id: string
      do {
        id = `preset-probe-${++serial}`
      } while (
        reserved.has(id) ||
        reserved.has(spawnedParticipantId(id)) ||
        reserved.has(countdownParticipantId(id))
      )
      reserved.add(id)
      return id
    }
    function expand(
      declarations: PresetOperation[],
      anchor: EventAnchor,
      depth: number,
      root = false,
    ) {
      if (depth > PRESET_LIMITS.depth) throw new PresetError('depth')
      const operations: EffectOperation[] = []
      patches.push({ anchor, operations })
      let state = root && definition.interaction === 'batch' ? preview : undefined
      for (const declaration of declarations) {
        if (++count > PRESET_LIMITS.operations) throw new PresetError('operations')
        operationIndex = count - 1
        semanticTarget = declaration.target
        if (root && reusedCost && declaration === definition.operations[0]) continue
        const { onTrigger, onEmpty, target: operationTarget } = declaration
        const operation = values.resolveOperation(
          declaration,
          { id: probeId(), ...(anchor.kind === 'action' ? { phase } : {}) },
          target,
        )
        if (
          validateOperations([operation], anchor).length ||
          (definition.interaction === 'draft' && isSkillPointOperation(operation))
        )
          throw new PresetError('form')
        if (state && isTargetedOperation(operation)) {
          const ids = targetIds(
            operation.target,
            operation.target.kind === 'participants'
              ? state.participants
              : operationTargets(state, operation.type),
          )
          if (!ids.length && onEmpty === 'skip' && operation.target.kind !== 'participants')
            continue
        }
        if (state) {
          if (operation.type === 'characterEffect') {
            const issue = characterEffectSourceIssue(state, operation, anchor)
            if (issue)
              throw new PresetError(
                issue === 'character-effect-anchor' ? 'characterEffectAnchor' : 'unavailable',
              )
          }
          const applied = applyOperations(state, [operation], anchor)
          if (applied.diagnostics.some((issue) => issue.severity === 'error'))
            throw new PresetError('form')
          // The engine can continue past unusable targets. Preset insertion is atomic.
          if (applied.diagnostics.some((issue) => issue.code === 'active-target'))
            throw new PresetError(operationTarget === 'self' ? 'activeTarget' : 'activeAlly')
          if (
            applied.diagnostics.some(
              (issue) => issue.code === 'missing-target' || issue.code === 'invalid-target',
            )
          )
            throw new PresetError('target')
          state = applied.state
        }
        operations.push(operation)
        if (onEmpty === 'skip' && !root) optional.add(operation.id)
        if (onTrigger) {
          const id =
            operation.type === 'spawnParticipant' && operation.participant.kind === 'scheduledEvent'
              ? spawnedParticipantId(operation.id)
              : operation.type === 'addSpeedModifier' && operation.duration.kind === 'countdown'
                ? countdownParticipantId(operation.id)
                : undefined
          if (!id) throw new PresetError('onTrigger')
          expand(onTrigger, { kind: 'trigger', participantId: id }, depth + 1)
        }
      }
    }
    expand(definition.operations, insertionAnchor, 0, true)
    const copyEvents = () =>
      context.document.plan.events.map((event) => ({
        ...event,
        anchor: { ...event.anchor },
        operations: [...event.operations],
      }))
    // Future optional groups are inspected with the same replay used for actual
    // submission. Outside the replay budget they remain ordinary no-op-capable
    // group operations; no future target set is guessed from today's roster.
    if (optional.size) {
      const events = copyEvents()
      for (const patch of patches) {
        const existing = events.find((event) => anchorKey(event.anchor) === anchorKey(patch.anchor))
        if (existing) existing.operations.push(...patch.operations)
        else events.push({ anchor: patch.anchor, operations: [...patch.operations] })
      }
      const empty = new Set(
        simulatePlan({ ...context.document.plan, events }, context.document.metadata.characterIds)
          .diagnostics.filter(
            (issue) =>
              issue.code === 'missing-target' &&
              issue.operationId &&
              optional.has(issue.operationId),
          )
          .map((issue) => issue.operationId),
      )
      // A skipped countdown has no trigger. Remove its descendant patches too,
      // rather than leaving orphan operations that can never execute.
      const owner = new Map<string, string>()
      for (const patch of patches)
        for (const operation of patch.operations) {
          if (operation.type === 'spawnParticipant')
            owner.set(spawnedParticipantId(operation.id), operation.id)
          if (operation.type === 'addSpeedModifier' && operation.duration.kind === 'countdown')
            owner.set(countdownParticipantId(operation.id), operation.id)
        }
      for (const patch of patches)
        if (patch.anchor.kind === 'trigger' && empty.has(owner.get(patch.anchor.participantId))) {
          for (const operation of patch.operations) empty.add(operation.id)
        }
      for (let index = patches.length - 1; index >= 0; index--) {
        const anchor = patches[index].anchor
        if (anchor.kind === 'trigger' && empty.has(owner.get(anchor.participantId)))
          patches.splice(index, 1)
      }
      for (const patch of patches)
        patch.operations = patch.operations.filter((operation) => !empty.has(operation.id))
    }
    // Allocate in execution declaration order: root operations, then trigger events.
    const ids = new Map<string, string>()
    for (const event of patches)
      for (const operation of event.operations) ids.set(operation.id, nextId())
    const participantIds = new Map<string, string>()
    for (const [old, id] of ids) {
      participantIds.set(spawnedParticipantId(old), spawnedParticipantId(id))
      participantIds.set(countdownParticipantId(old), countdownParticipantId(id))
    }
    const events = copyEvents()
    for (const patch of patches) {
      const anchor =
        patch.anchor.kind === 'trigger'
          ? {
              ...patch.anchor,
              participantId:
                participantIds.get(patch.anchor.participantId) ?? patch.anchor.participantId,
            }
          : { ...patch.anchor }
      const operations = patch.operations.map((operation) => ({
        ...operation,
        id: ids.get(operation.id)!,
      }))
      const existing = events.find((event) => anchorKey(event.anchor) === anchorKey(anchor))
      if (existing) existing.operations.push(...operations)
      else events.push({ anchor, operations })
    }
    return {
      document: { ...context.document, plan: { ...context.document.plan, events } },
      operationIds: [...ids.values()],
      invalid: [],
    }
  } catch (error) {
    if (error instanceof PresetError || error instanceof SimulationError) {
      const code = error instanceof PresetError ? error.code : 'form'
      return {
        operationIds: [],
        invalid: [code],
        issue: {
          code,
          ...(parameters.has(code) ? { field: code } : {}),
          ...(operationIndex === undefined ? {} : { operationIndex }),
          ...(semanticTarget === undefined ? {} : { target: semanticTarget }),
        },
      }
    }
    throw error
  }
}
