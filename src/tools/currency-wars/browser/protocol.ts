import type { OptimizationRequest, OptimizationBatch, Snapshot } from '../types'

export interface SolveMessage {
  requestId: number
  snapshot: Snapshot
  request: OptimizationRequest
}
export interface ResultMessage {
  requestId: number
  result: OptimizationBatch
}

export type WorkerFailure = 'unavailable' | 'runtime' | 'message'
export interface WorkerPort {
  onmessage: ((event: MessageEvent<ResultMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(message: SolveMessage): void
  terminate(): void
}
export type WorkerFactory = () => WorkerPort
