import { computed, ref, shallowReadonly, shallowRef, watch } from 'vue'
import {
  simulatePlan,
  previewOperationState,
  DEFAULT_LIMITS,
} from '../../../engine/action-planner/engine'
import { anchorKey } from '../../../engine/action-planner/queue'
import { validatePlan } from '../../../engine/action-planner/validation'
import { operationTargets } from '../../../engine/action-planner/targeting'
import type {
  EffectOperation,
  EventAnchor,
  SimulationPlan,
} from '../../../engine/action-planner/types'
import { saveOperation, moveOperation } from '../model/effect-config'
import {
  buildOperation,
  contextAt,
  operationDraft,
  operationsAt,
  previewDraft,
  type OperationDraft,
  type PlannerDocument,
  type PlannerMetadata,
} from '../model/editor'

export const emptyPlan = (): SimulationPlan => ({ actors: [], events: [], ...DEFAULT_LIMITS })
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
  initialPlan: SimulationPlan = emptyPlan(),
  initialMetadata: PlannerMetadata = { customNames: {}, characterIds: {} },
) {
  const document = shallowRef<PlannerDocument>({ plan: initialPlan, metadata: initialMetadata })
  const plan = computed(() => document.value.plan)
  const result = shallowRef(simulatePlan(initialPlan))
  const selected = ref<EventAnchor>({ kind: 'start' })
  const stage = ref<'setup' | 'planning'>('setup')
  const view = ref<'future' | 'queue'>('future')
  const queueCursor = ref<EventAnchor>({ kind: 'start' })
  const draft = ref<OperationDraft>()
  const invalid = ref<string[]>([])
  let serial = 0
  const nextId = () => {
    let id: string
    do {
      id = `editor-${++serial}`
    } while (
      plan.value.actors.some((a) => a.id === id) ||
      plan.value.events.some((e) => e.operations.some((o) => o.id === id))
    )
    return id
  }
  const operations = computed(() => operationsAt(plan.value, selected.value))
  const context = computed(() => contextAt(plan.value, result.value, selected.value))
  const preview = computed(() =>
    draft.value
      ? previewDraft(context.value, operations.value, selected.value, draft.value)
      : undefined,
  )
  const targets = computed(() => operationTargets(preview.value))
  const unreached = computed(() =>
    plan.value.events.filter(
      (e) =>
        e.operations.length &&
        e.anchor.kind !== 'start' &&
        !result.value.records.some((r) => anchorKey(r.anchor) === anchorKey(e.anchor)),
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
  const snapshot = computed(() => result.value.snapshots[queueIndex.value])
  function cancel() {
    draft.value = undefined
    invalid.value = []
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
    const ids = new Set(next.events.flatMap((e) => e.operations.map((o) => o.id)))
    document.value = {
      plan: next,
      metadata: {
        ...metadata,
        customNames: Object.fromEntries(
          Object.entries(metadata.customNames).filter(([id]) => ids.has(id)),
        ),
      },
    }
    result.value = simulatePlan(next)
  }
  function applySetup(
    actors: SimulationPlan['actors'],
    maxNodes: number,
    maxAV: number,
    characterIds: Record<string, string>,
  ) {
    const next = { ...plan.value, actors, maxNodes, maxAV }
    if (validatePlan(next).length) return false
    cancel()
    replacePlan(next, {
      ...document.value.metadata,
      characterIds: { ...document.value.metadata.characterIds, ...characterIds },
    })
    return true
  }
  function edit(operation?: EffectOperation) {
    const next = operationDraft(
      operation,
      operation ? document.value.metadata.customNames[operation.id] : '',
    )
    if (!operation && context.value) {
      const p = previewDraft(context.value, operations.value, selected.value, next)
      next.selectedIds = operationTargets(p)
        .filter((t) => t.kind === 'actor')
        .slice(0, 1)
        .map((t) => t.id)
    }
    draft.value = next
    invalid.value = []
  }
  function updateOperations(next: EffectOperation[], metadata = document.value.metadata) {
    const key = anchorKey(selected.value)
    const events = plan.value.events.filter((e) => anchorKey(e.anchor) !== key)
    if (next.length) events.push({ anchor: { ...selected.value }, operations: next })
    replacePlan({ ...plan.value, events }, metadata)
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
    if (old && canonical(old) === canonical(op))
      document.value = { ...document.value, metadata: { ...document.value.metadata, customNames } }
    else
      updateOperations(saveOperation(operations.value, op, selected.value), {
        ...document.value.metadata,
        customNames,
      })
    cancel()
    return true
  }
  function remove(id: string) {
    cancel()
    updateOperations(operations.value.filter((o) => o.id !== id))
  }
  function move(id: string, delta: -1 | 1) {
    cancel()
    updateOperations(moveOperation(operations.value, id, delta, selected.value))
  }
  function deleteEvent(anchor: EventAnchor) {
    cancel()
    replacePlan({
      ...plan.value,
      events: plan.value.events.filter((e) => anchorKey(e.anchor) !== anchorKey(anchor)),
    })
  }
  function stepQueue(delta: -1 | 1) {
    const index = Math.min(
      Math.max(0, queueIndex.value + delta),
      Math.max(0, result.value.snapshots.length - 1),
    )
    queueCursor.value =
      index === 0 ? { kind: 'start' } : { ...result.value.records[index - 1]!.anchor }
    select(queueCursor.value)
  }
  function reset() {
    cancel()
    replacePlan(emptyPlan(), { customNames: {}, characterIds: {} })
    selected.value = { kind: 'start' }
    queueCursor.value = { kind: 'start' }
    stage.value = 'setup'
    view.value = 'future'
  }
  function operationContext(operation: EffectOperation) {
    return context.value
      ? previewOperationState(
          context.value,
          operations.value,
          selected.value,
          operation.phase ?? 'preAction',
          operation.id,
        )
      : undefined
  }
  return {
    document: shallowReadonly(document),
    plan,
    result: shallowReadonly(result),
    selected,
    stage,
    view,
    draft,
    invalid,
    operations,
    context,
    preview,
    targets,
    unreached,
    queueIndex,
    snapshot,
    nextId,
    replacePlan,
    applySetup,
    select,
    edit,
    cancel,
    submit,
    remove,
    move,
    deleteEvent,
    stepQueue,
    reset,
    operationContext,
  }
}
