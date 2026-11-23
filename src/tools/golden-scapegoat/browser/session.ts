import { shallowRef } from 'vue'
import type { ReadyMap } from '../engine/map'
import type { SearchLimits, SearchResult } from '../engine/solve'

export interface SolveRequest {
  id: number
  map: ReadyMap
  limits: SearchLimits
}

export interface SolveReply {
  id: number
  result: SearchResult
}

export interface WorkerPort {
  onmessage: ((event: MessageEvent<SolveReply>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(request: SolveRequest): void
  terminate(): void
}

export type SessionStatus =
  { status: 'idle' | 'searching' | 'cancelled' | 'workerError' } | SearchResult

function reportWorkerError(stage: 'creation' | 'request' | 'execution' | 'reply', cause: unknown) {
  if (import.meta.env.DEV) console.error(`[golden-scapegoat] Worker failed during ${stage}`, cause)
}

export function createSearchSession(createWorker: () => WorkerPort) {
  const status = shallowRef<SessionStatus>({ status: 'idle' })
  let active: WorkerPort | undefined
  let sequence = 0

  function release() {
    const worker = active
    if (!worker) return
    active = undefined
    worker.onmessage = worker.onerror = worker.onmessageerror = null
    worker.terminate()
  }

  function start(map: ReadyMap, limits: SearchLimits) {
    release()
    const id = ++sequence
    status.value = { status: 'searching' }
    let stage: 'creation' | 'request' = 'creation'
    try {
      const worker = createWorker()
      active = worker
      function finish(result: SessionStatus) {
        if (active !== worker || id !== sequence) return false
        release()
        status.value = result
        return true
      }
      worker.onmessage = ({ data }) => {
        if (data.id === id) finish(data.result)
      }
      worker.onerror = (event) => {
        event.preventDefault()
        if (finish({ status: 'workerError' })) reportWorkerError('execution', event.error ?? event)
      }
      worker.onmessageerror = (event) => {
        if (finish({ status: 'workerError' })) reportWorkerError('reply', event)
      }
      stage = 'request'
      worker.postMessage({ id, map, limits })
    } catch (error) {
      release()
      status.value = { status: 'workerError' }
      reportWorkerError(stage, error)
    }
  }

  function cancel() {
    if (!active) return
    release()
    status.value = { status: 'cancelled' }
  }

  function reset() {
    release()
    status.value = { status: 'idle' }
  }

  return { status, start, cancel, reset }
}
