import { resolveElationContributors } from '../model/aha-config'
import { computed, ref, shallowReadonly, shallowRef, watch } from 'vue'
import { simulatePlan, previewOperationState } from '../engine/engine'
import { anchorKey, spawnedParticipantId, countdownParticipantId } from '../engine/queue'
import { validatePlan } from '../engine/validation'
import { usesSkillPoints } from '../engine/skill-points'
import { isTargetedOperationType, operationTargets } from '../engine/targeting'
import type {
  AhaConfig,
  ActionSkill,
  EffectOperation,
  EventAnchor,
  CycleMode,
  PlanEvent,
  SimulationPlan,
} from '../engine/types'
import { saveOperation, moveOperation } from '../model/effect-config'
import { buildCurrentQueueView } from '../model/current-queue'
import { presets } from '../presets/catalog'
import { compilePreset } from '../presets/resolver'
import { selectionOperation } from '../presets/values'
import { gameData } from '../data/adapters/game-data'
import type { PresetRequest, PresetResult } from '../presets/types'
import {
  emptyDocument,
  serializePlannerDocument,
  preparePlannerDocument,
  PlannerFileError,
  referencedIds,
  type FileErrorCode,
  type ResourceIssue,
  type MigrationNotice,
} from '../model/document-file'
import {
  buildOperation,
  contextAt,
  operationDraft,
  previewDraft,
  metadataValue,
  type OperationDraft,
  type PlannerDocument,
  type PlannerMetadata,
} from '../model/editor'

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    )
  return JSON.stringify(value) ?? 'null'
}
/** One committed document. Engine results remain shallow, page-owned and unproxied. */
export function useActionPlanner(
  initialPlan: SimulationPlan = emptyDocument().plan,
  initialMetadata: PlannerMetadata = { customNames: {}, characterIds: {} },
  initialName = '',
) {
  const document = shallowRef<PlannerDocument>({
    name: initialName,
    plan: initialPlan,
    metadata: initialMetadata,
  })
  const plan = computed(() => document.value.plan)
  const result = shallowRef(simulatePlan(initialPlan))
  const selected = ref<EventAnchor>({ kind: 'start' })
  const stage = ref<'setup' | 'planning'>('setup')
  const view = ref<'future' | 'queue'>('future')
  const queueCursor = ref<EventAnchor>({ kind: 'start' })
  const draft = ref<OperationDraft>()
  const invalid = ref<string[]>([])
  const presetFailure = shallowRef<PresetResult['issue']>()
  const documentError = ref<FileErrorCode>()
  const migrationNotice = shallowRef<MigrationNotice>()
  const resourceIssues = shallowRef<ResourceIssue[]>([])
  const setupRevision = ref(0)
  let reservedIds = referencedIds(initialPlan)
  const allocatedIds = new Set<string>()
  let serial = 0
  const nextId = () => {
    let id: string
    do {
      id = `editor-${++serial}`
    } while (
      reservedIds.has(id) ||
      reservedIds.has(spawnedParticipantId(id)) ||
      reservedIds.has(countdownParticipantId(id))
    )
    reservedIds.add(id)
    allocatedIds.add(id)
    return id
  }
  const selectedEvent = computed(() => {
    const key = anchorKey(selected.value)
    return plan.value.events.find((event) => anchorKey(event.anchor) === key)
  })
  const operations = computed(() => selectedEvent.value?.operations ?? [])
  const context = computed(() => contextAt(plan.value, result.value, selected.value))
  const preview = computed(() =>
    draft.value
      ? previewDraft(
          context.value,
          operations.value,
          selected.value,
          draft.value,
          selectedEvent.value?.skill,
        )
      : undefined,
  )
  function temporaryIds() {
    const reserved = referencedIds(plan.value)
    let serial = 0
    return () => {
      let id: string
      do {
        id = `preset-draft-${++serial}`
      } while (
        reserved.has(id) ||
        reserved.has(spawnedParticipantId(id)) ||
        reserved.has(countdownParticipantId(id))
      )
      reserved.add(id)
      return id
    }
  }
  const presetIssues = computed(() =>
    Object.fromEntries(
      presets.map((definition) => {
        const built = compilePreset(
          definition,
          {
            document: document.value,
            anchor: selected.value,
            phase: draft.value?.phase ?? 'postAction',
            preview: preview.value,
            selectedIds: draft.value?.selectedIds,
            translate: (key) => key,
          },
          gameData.characters,
          temporaryIds(),
        )
        const issue = built.invalid[0]
        return [
          definition.id,
          selectionOperation(definition) && ['target', 'activeTarget', 'activeAlly'].includes(issue)
            ? undefined
            : issue,
        ]
      }),
    ),
  )
  const targets = computed(() => {
    const type = draft.value?.type
    if (!type || type === 'spawnParticipant') return operationTargets(preview.value)
    return isTargetedOperationType(type) ? operationTargets(preview.value, type) : []
  })
  const unreached = computed(() =>
    plan.value.events.filter(
      (e) =>
        e.operations.length &&
        e.anchor.kind !== 'start' &&
        !(e.anchor.kind === 'cycleBoundary' && plan.value.cycleMode === 'none') &&
        !result.value.records.some((r) => anchorKey(r.anchor) === anchorKey(e.anchor)),
    ),
  )
  const inactive = computed(() =>
    plan.value.events.filter(
      (e) =>
        e.operations.length && e.anchor.kind === 'cycleBoundary' && plan.value.cycleMode === 'none',
    ),
  )
  const queueIndex = computed(() =>
    queueCursor.value.kind === 'start'
      ? 0
      : Math.max(
          0,
          result.value.records.findIndex(
            (r) => anchorKey(r.anchor) === anchorKey(queueCursor.value),
          ) + 1,
        ),
  )
  const currentQueueView = computed(() => buildCurrentQueueView(result.value, queueIndex.value))
  function cancel() {
    draft.value = undefined
    invalid.value = []
    presetFailure.value = undefined
  }
  watch([stage, view], cancel, { flush: 'sync' })
  watch(
    () => [
      draft.value?.type,
      draft.value?.phase,
      draft.value?.duration.kind,
      draft.value?.participant.kind,
      draft.value?.targetKind,
    ],
    () => {
      invalid.value = []
    },
  )
  function select(anchor: EventAnchor) {
    if (anchorKey(anchor) !== anchorKey(selected.value)) {
      cancel()
      selected.value = { ...anchor }
    }
  }
  function replacePlan(next: SimulationPlan, metadata = document.value.metadata) {
    try {
      const ids = new Set(next.events.flatMap((event) => event.operations.map((op) => op.id)))
      const prepared = preparePlannerDocument({
        name: document.value.name,
        plan: next,
        metadata: {
          ...metadata,
          customNames: Object.fromEntries(
            Object.entries(metadata.customNames).filter(([id]) => ids.has(id)),
          ),
          characterIds: Object.fromEntries(
            Object.entries(metadata.characterIds).filter(([id]) =>
              next.actors.some((actor) => actor.id === id && actor.camp === 'ally'),
            ),
          ),
        },
      })
      const cursorKey = anchorKey(queueCursor.value)
      const resetCursor =
        queueCursor.value.kind !== 'start' &&
        !prepared.result.records.some((record) => anchorKey(record.anchor) === cursorKey)
      referencedIds(prepared.document.plan).forEach((id) => reservedIds.add(id))
      result.value = prepared.result
      resourceIssues.value = prepared.issues
      documentError.value = undefined
      if (resetCursor) queueCursor.value = { kind: 'start' }
      document.value = prepared.document
    } catch (error) {
      documentError.value = error instanceof PlannerFileError ? error.code : 'simulation'
      return false
    }
    return true
  }
  function applySetup(
    actors: SimulationPlan['actors'],
    maxNodes: number,
    maxAV: number,
    characterIds: Record<string, string>,
    cycleMode: CycleMode = plan.value.cycleMode,
    aha: AhaConfig = plan.value.aha,
  ) {
    const resolved = resolveElationContributors(actors, characterIds, plan.value.aha.contributorIds)
    const next = {
      ...plan.value,
      actors,
      maxNodes,
      maxAV,
      cycleMode,
      aha: { ...aha, id: plan.value.aha.id, contributorIds: resolved.contributorIds },
    }
    if (validatePlan(next).length) return false
    if (
      !replacePlan(next, {
        ...document.value.metadata,
        characterIds,
      })
    )
      return false
    cancel()
    return true
  }
  function edit(operation?: EffectOperation) {
    const next = operationDraft(
      operation,
      operation ? metadataValue(document.value.metadata.customNames, operation.id) : '',
    )
    if (!operation && context.value) {
      const p = previewDraft(
        context.value,
        operations.value,
        selected.value,
        next,
        selectedEvent.value?.skill,
      )
      next.selectedIds = operationTargets(p)
        .filter((t) => t.kind === 'actor')
        .slice(0, 1)
        .map((t) => t.id)
    }
    draft.value = next
    invalid.value = []
  }
  function updateOperations(next: EffectOperation[], metadata = document.value.metadata) {
    const existing = selectedEvent.value
    return updateEvent(
      { ...existing, anchor: existing?.anchor ?? { ...selected.value }, operations: next },
      metadata,
    )
  }
  function updateEvent(next: PlanEvent, metadata = document.value.metadata) {
    const key = anchorKey(next.anchor)
    const events = [...plan.value.events]
    const index = events.findIndex((event) => anchorKey(event.anchor) === key)
    if (next.operations.length || next.skill !== undefined) {
      if (index === -1) events.push(next)
      else events[index] = next
    } else {
      if (index === -1) return true
      events.splice(index, 1)
    }
    return replacePlan({ ...plan.value, events }, metadata)
  }
  function setSkill(skill?: ActionSkill) {
    const anchor = selected.value
    if (
      anchor.kind !== 'action' ||
      !usesSkillPoints(
        context.value?.participants.find((actor) => actor.id === anchor.participantId),
      )
    )
      return false
    const existing = selectedEvent.value
    if (
      !updateEvent({
        ...existing,
        anchor: existing?.anchor ?? { ...anchor },
        operations: operations.value,
        skill,
      })
    )
      return false
    cancel()
    return true
  }
  function submit() {
    if (!draft.value) return false
    const parsed = buildOperation(
      draft.value,
      draft.value.id ?? nextId(),
      selected.value,
      preview.value,
    )
    invalid.value = parsed.invalid
    if (!parsed.operation) return false
    const op = parsed.operation
    const customNames = { ...document.value.metadata.customNames }
    if (draft.value.customName.trim()) customNames[op.id] = draft.value.customName.trim()
    else delete customNames[op.id]
    // Display-only edits do not replay the simulation.
    const old = operations.value.find((o) => o.id === op.id)
    if (old && canonical(old) === canonical(op)) {
      const candidate = { ...document.value, metadata: { ...document.value.metadata, customNames } }
      try {
        serializePlannerDocument(candidate)
      } catch (error) {
        documentError.value = error instanceof PlannerFileError ? error.code : 'structure'
        return false
      }
      document.value = candidate
      documentError.value = undefined
    } else if (
      !updateOperations(saveOperation(operations.value, op, selected.value), {
        ...document.value.metadata,
        customNames,
      })
    )
      return false
    cancel()
    return true
  }
  function submitPreset(request: PresetRequest) {
    if (!draft.value || draft.value.id) return false
    const definition = presets.find((preset) => preset.id === request.id)
    if (!definition) {
      invalid.value = ['form']
      return false
    }
    const built = compilePreset(
      definition,
      {
        document: document.value,
        anchor: selected.value,
        phase: draft.value.phase,
        preview: preview.value,
        selectedIds: draft.value.selectedIds,
        values: request.values,
        translate: request.translate,
      },
      gameData.characters,
      definition.interaction === 'draft' ? temporaryIds() : nextId,
    )
    if (definition.interaction === 'draft') {
      invalid.value = built.invalid
      if (!built.document) return false
      const generated = built.document.plan.events
        .flatMap((event) => event.operations)
        .find((operation) => built.operationIds.includes(operation.id))!
      const next = operationDraft(generated)
      next.id = undefined
      next.original = undefined
      draft.value = next
      return true
    }
    return submitBatchPreset(built)
  }
  function submitBatchPreset(built: PresetResult) {
    invalid.value = built.invalid
    presetFailure.value = built.issue
    if (!built.document) return false
    try {
      const prepared = preparePlannerDocument(built.document)
      const generated = new Set(built.operationIds)
      if (
        prepared.result.diagnostics.some(
          (diagnostic) =>
            diagnostic.severity === 'error' ||
            (diagnostic.operationId &&
              generated.has(diagnostic.operationId) &&
              (diagnostic.code === 'missing-target' ||
                diagnostic.code === 'invalid-target' ||
                diagnostic.code === 'active-target')),
        )
      ) {
        invalid.value = ['form']
        return false
      }
      // All validation and simulation complete before the single document publication.
      result.value = prepared.result
      resourceIssues.value = prepared.issues
      document.value = prepared.document
      referencedIds(prepared.document.plan).forEach((id) => reservedIds.add(id))
      documentError.value = undefined
      if (
        queueCursor.value.kind !== 'start' &&
        !prepared.result.records.some(
          (record) => anchorKey(record.anchor) === anchorKey(queueCursor.value),
        )
      )
        queueCursor.value = { kind: 'start' }
      cancel()
      return true
    } catch (error) {
      documentError.value = error instanceof PlannerFileError ? error.code : 'simulation'
      return false
    }
  }
  function remove(id: string) {
    if (updateOperations(operations.value.filter((o) => o.id !== id))) cancel()
  }
  function move(id: string, delta: -1 | 1) {
    if (updateOperations(moveOperation(operations.value, id, delta, selected.value))) cancel()
  }
  function deleteEvent(anchor: EventAnchor) {
    if (
      replacePlan({
        ...plan.value,
        events: plan.value.events.filter((e) => anchorKey(e.anchor) !== anchorKey(anchor)),
      })
    )
      cancel()
  }
  function stepQueue(delta: -1 | 1) {
    if (!currentQueueView.value) return
    const index = Math.min(Math.max(0, queueIndex.value + delta), result.value.records.length)
    if (index === queueIndex.value) return
    cancel()
    queueCursor.value =
      index === 0 ? { kind: 'start' } : { ...result.value.records[index - 1]!.anchor }
    select(queueCursor.value)
  }
  function reset() {
    return restoreDocument(emptyDocument())
  }
  function restoreDocument(input: PlannerDocument) {
    try {
      restorePrepared(preparePlannerDocument(input))
    } catch (error) {
      documentError.value = error instanceof PlannerFileError ? error.code : 'simulation'
      return false
    }
    return true
  }
  function restorePrepared(prepared: ReturnType<typeof preparePlannerDocument>) {
    cancel()
    result.value = prepared.result
    document.value = prepared.document
    resourceIssues.value = prepared.issues
    migrationNotice.value = prepared.migration
    documentError.value = undefined
    reservedIds = referencedIds(prepared.document.plan)
    allocatedIds.forEach((id) => reservedIds.add(id))
    serial = 0
    selected.value = { kind: 'start' }
    queueCursor.value = { kind: 'start' }
    stage.value = 'setup'
    view.value = 'future'
    setupRevision.value++
    return true
  }
  function rename(name: string) {
    const candidate = { ...document.value, name: name.trim() }
    try {
      serializePlannerDocument(candidate)
    } catch (error) {
      documentError.value = error instanceof PlannerFileError ? error.code : 'structure'
      return false
    }
    if (candidate.name !== document.value.name) document.value = candidate
    documentError.value = undefined
    return true
  }
  // Execution contexts depend on the plan and anchor, never translated presentation.
  const operationContexts = computed(
    () =>
      new Map(
        operations.value.map((operation) => [
          operation.id,
          context.value
            ? previewOperationState(
                context.value,
                operations.value,
                selected.value,
                operation.phase ?? 'preAction',
                operation.id,
                selectedEvent.value?.skill,
              )
            : undefined,
        ]),
      ),
  )
  function operationContext(operation: EffectOperation) {
    return operationContexts.value.get(operation.id)
  }
  return {
    document: shallowReadonly(document),
    documentError,
    resourceIssues,
    migrationNotice,
    setupRevision,
    restoreDocument,
    restorePrepared,
    rename,
    plan,
    result: shallowReadonly(result),
    selected,
    stage,
    view,
    draft,
    invalid,
    presetFailure,
    operations,
    context,
    preview,
    presetIssues,
    targets,
    unreached,
    inactive,
    queueIndex,
    currentQueueView,
    nextId,
    replacePlan,
    applySetup,
    setSkill,
    select,
    edit,
    cancel,
    submit,
    submitPreset,
    remove,
    move,
    deleteEvent,
    stepQueue,
    reset,
    operationContext,
  }
}
