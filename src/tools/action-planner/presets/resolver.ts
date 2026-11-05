import { applyOperations } from '../engine/operations'
import { simulatePlan } from '../engine/engine'
import {
  anchorKey,
  countdownParticipantId,
  spawnedParticipantId,
  SimulationError,
} from '../engine/queue'
import { operationTargets, targetIds } from '../engine/targeting'
import { validateOperations } from '../engine/validation'
import type { EffectOperation, EventAnchor, PlanEvent, Target } from '../engine/types'
import { metadataValue } from '../model/editor'
import { referencedIds } from '../model/document-file'
import type { CharacterRecord } from '../data/schema'
import { collectInputs, PresetError, valueResolver } from './values'
import {
  PRESET_LIMITS,
  type PresetContext,
  type PresetDefinition,
  type PresetOperation,
  type PresetResult,
  type PresetTarget,
  type Value,
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
    if (!context.preview) throw new PresetError('context')
    if (definition.startOnly && context.anchor.kind !== 'start') throw new PresetError('startOnly')
    for (const input of collectInputs(definition)) parameters.add(input.id)
    const values = valueResolver(definition, characters, context.translate, context.values)
    let self: string | undefined
    if (definition.characterId) {
      const actors = context.document.plan.actors.filter(
        (actor) =>
          actor.camp === 'ally' &&
          metadataValue(context.document.metadata.characterIds, actor.id) ===
            definition.characterId,
      )
      if (!actors.length) throw new PresetError('missing')
      if (actors.length !== 1) throw new PresetError('ambiguous')
      const participant = context.preview.participants.find(
        (p) => p.id === actors[0]!.id && p.kind === 'actor',
      )
      if (!participant) throw new PresetError('unavailable')
      if (definition.selfPresence === 'present' && participant.departed)
        throw new PresetError('departed')
      if (definition.selfPresence === 'departed' && !participant.departed)
        throw new PresetError('unavailable')
      self = participant.id
    }
    const snapshots = new Map<string, string[]>()
    for (const [name, spec] of Object.entries(definition.snapshots ?? {})) {
      const ids = targetIds(
        { kind: spec.target },
        operationTargets(context.preview, spec.operation),
      )
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
      let state = root && definition.interaction === 'batch' ? context.preview : undefined
      for (const declaration of declarations) {
        if (++count > PRESET_LIMITS.operations) throw new PresetError('operations')
        operationIndex = count - 1
        semanticTarget = declaration.target
        const { onTrigger, onEmpty, target: operationTarget, ...fields } = declaration
        const operation = {
          ...(values.tree(fields) as object),
          id: probeId(),
          ...(operationTarget ? { target: target(operationTarget) } : {}),
          ...(anchor.kind === 'action' ? { phase: context.phase } : {}),
        } as EffectOperation
        function invalidName(name: unknown, source: Value) {
          if (typeof name !== 'string' || !name.trim())
            throw new PresetError(
              source &&
                typeof source === 'object' &&
                (source.type === 'user-input' || source.type === 'ref')
                ? source.id
                : 'form',
            )
        }
        if (operation.type === 'spawnParticipant' && declaration.type === 'spawnParticipant')
          invalidName(operation.participant.name, declaration.participant.name)
        if (
          operation.type === 'addSpeedModifier' &&
          operation.duration.kind === 'countdown' &&
          declaration.type === 'addSpeedModifier' &&
          declaration.duration.kind === 'countdown'
        )
          invalidName(operation.duration.name, declaration.duration.name)
        if (validateOperations([operation], anchor).length) throw new PresetError('form')
        if (operation.type === 'spawnParticipant')
          operation.participant.name = operation.participant.name.trim()
        if (operation.type === 'addSpeedModifier' && operation.duration.kind === 'countdown')
          operation.duration.name = operation.duration.name.trim()
        if (state && operation.type !== 'spawnParticipant') {
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
          const applied = applyOperations(state, [operation], anchor)
          const issue = applied.diagnostics[0]
          if (issue) {
            if (issue.code === 'active-target')
              throw new PresetError(operationTarget === 'self' ? 'activeTarget' : 'activeAlly')
            throw new PresetError('target')
          }
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
    expand(definition.operations, context.anchor, 0, true)
    // Future optional groups are inspected with the same replay used for actual
    // submission. Outside the replay budget they remain ordinary no-op-capable
    // group operations; no future target set is guessed from today's roster.
    if (optional.size) {
      const events = context.document.plan.events.map((event) => ({
        anchor: event.anchor,
        operations: [...event.operations],
      }))
      for (const patch of patches) {
        const existing = events.find((event) => anchorKey(event.anchor) === anchorKey(patch.anchor))
        if (existing) existing.operations.push(...patch.operations)
        else events.push({ anchor: patch.anchor, operations: [...patch.operations] })
      }
      const empty = new Set(
        simulatePlan({ ...context.document.plan, events })
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
    const events = context.document.plan.events.map((event) => ({
      anchor: { ...event.anchor },
      operations: [...event.operations],
    }))
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
