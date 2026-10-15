import { computed, reactive, ref, shallowRef } from 'vue'
import type { OptimizationRequest, OptimizationResult, Snapshot, Task } from '../types'
import type { WorkerFactory, WorkerFailure, WorkerPort } from '../browser/protocol'
import { validateRequest } from '../validation'

export interface SolverForm {
  slots: number | null
  emblemBudget: number | null
  timeLimitSeconds: number | null
  includeExperts: boolean
  taskIds: string[]
}
export type FormField = 'slots' | 'emblemBudget' | 'timeLimitSeconds' | 'taskIds'
export interface SolvedAttempt {
  requestId: number
  request: OptimizationRequest
  result: OptimizationResult
}
export function formErrors(form: SolverForm, tasks: Task[]): FormField[] {
  const errors: FormField[] = []
  if (form.slots === null || ![11, 12, 13].includes(form.slots)) errors.push('slots')
  if (
    form.emblemBudget === null ||
    !Number.isSafeInteger(form.emblemBudget) ||
    form.emblemBudget < 12
  )
    errors.push('emblemBudget')
  if (
    form.timeLimitSeconds === null ||
    !Number.isSafeInteger(form.timeLimitSeconds) ||
    form.timeLimitSeconds < 1
  )
    errors.push('timeLimitSeconds')
  if (
    !form.taskIds.length ||
    new Set(form.taskIds).size !== form.taskIds.length ||
    form.taskIds.some((id) => !tasks.some((t) => t.id === id))
  )
    errors.push('taskIds')
  return errors
}
export function requestFingerprint(request: OptimizationRequest) {
  return JSON.stringify([
    request.slots,
    request.emblemBudget,
    request.timeLimitSeconds,
    request.includeExperts,
    request.tasks
      .map((t) => [t.id, t.traitId, t.requiredCount])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ])
}

/** Page-owned state; only a detached request and plain snapshot cross the Worker boundary. */
export function createCurrencyWarsSession(
  snapshot: Snapshot,
  tasks: Task[],
  createWorker: WorkerFactory,
) {
  const form = reactive<SolverForm>({
    slots: 13,
    emblemBudget: 12,
    timeLimitSeconds: 30,
    includeExperts: false,
    taskIds: tasks.map((t) => t.id),
  })
  const busy = ref(false)
  const attempted = ref(false)
  const cancelled = ref(false)
  const failure = shallowRef<WorkerFailure | 'input' | 'data'>()
  const lastAttempt = shallowRef<SolvedAttempt>()
  const lastValid = shallowRef<SolvedAttempt>()
  const runningRequest = shallowRef<OptimizationRequest>()
  const errors = computed(() => formErrors(form, tasks))
  let sequence = 0
  let activeId: number | undefined
  let worker: WorkerPort | undefined
  let disposed = false
  const request = (): OptimizationRequest => ({
    slots: form.slots!,
    emblemBudget: form.emblemBudget!,
    timeLimitSeconds: form.timeLimitSeconds!,
    includeExperts: form.includeExperts,
    tasks: tasks.filter((t) => form.taskIds.includes(t.id)).map((t) => ({ ...t })),
  })
  const stale = computed(
    () =>
      !!lastValid.value &&
      (errors.value.length > 0 ||
        requestFingerprint(lastValid.value.request) !== requestFingerprint(request())),
  )
  const historical = computed(
    () =>
      !!lastValid.value &&
      (busy.value ||
        cancelled.value ||
        !!failure.value ||
        lastAttempt.value?.requestId !== lastValid.value.requestId),
  )

  function release() {
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      worker = undefined
    }
    activeId = undefined
    busy.value = false
    runningRequest.value = undefined
  }
  function fail(id: number, code: WorkerFailure) {
    if (disposed || activeId !== id) return
    failure.value = code
    release()
  }
  function start() {
    if (disposed || busy.value) return false
    attempted.value = true
    cancelled.value = false
    if (errors.value.length) {
      failure.value = 'input'
      return false
    }
    const submitted = request()
    try {
      validateRequest(snapshot, submitted, true)
    } catch {
      failure.value = 'data'
      return false
    }
    const id = ++sequence
    busy.value = true
    activeId = id
    failure.value = undefined
    runningRequest.value = submitted
    try {
      worker = createWorker()
      worker.onmessage = (event) => {
        if (disposed || activeId !== id || event.data?.requestId !== id) return
        const result = event.data.result
        if (
          !result ||
          !['optimal', 'feasible', 'no-result', 'infeasible', 'error', 'empty'].includes(
            result.status,
          ) ||
          !Number.isFinite(result.elapsedSeconds) ||
          (['optimal', 'feasible'].includes(result.status) &&
            (!result.lineup || result.evaluation?.valid !== true))
        ) {
          fail(id, 'message')
          return
        }
        const attempt: SolvedAttempt = { requestId: id, request: submitted, result }
        lastAttempt.value = attempt
        if (result.status === 'optimal' || result.status === 'feasible') lastValid.value = attempt
        release()
      }
      worker.onerror = (event) => {
        event.preventDefault()
        fail(id, 'runtime')
      }
      worker.onmessageerror = () => fail(id, 'message')
      // JSON conversion also removes Vue reactive proxies without transferring business state.
      worker.postMessage(
        JSON.parse(JSON.stringify({ requestId: id, snapshot, request: submitted })),
      )
    } catch {
      fail(id, 'unavailable')
      return false
    }
    return true
  }
  function cancel() {
    if (!busy.value) return
    cancelled.value = true
    release()
  }
  function dispose() {
    disposed = true
    release()
  }
  function selectAll() {
    form.taskIds = tasks.map((t) => t.id)
  }
  function clearSelection() {
    form.taskIds = []
  }
  return {
    form,
    busy,
    attempted,
    errors,
    failure,
    cancelled,
    lastAttempt,
    lastValid,
    runningRequest,
    stale,
    historical,
    start,
    cancel,
    dispose,
    selectAll,
    clearSelection,
  }
}
