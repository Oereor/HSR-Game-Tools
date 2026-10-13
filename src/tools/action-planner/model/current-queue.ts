import { queueSnapshot } from '../../../engine/action-planner/queue'
import type { NodeRecord, QueueEntry, SimulationResult } from '../../../engine/action-planner/types'

export type CurrentQueueView =
  | { kind: 'start'; elapsedAV: number; waiting: QueueEntry[] }
  | { kind: 'acting'; elapsedAV: number; current: NodeRecord; waiting: QueueEntry[] }

/** Read event-entry states without changing the engine's post-settlement snapshots. */
export function buildCurrentQueueView(
  result: SimulationResult,
  index: number,
): CurrentQueueView | undefined {
  if (!Number.isInteger(index) || index < 0) return undefined
  if (index === 0) {
    const initial = result.snapshots[0]
    return initial
      ? { kind: 'start', elapsedAV: initial.elapsedAV, waiting: initial.queue }
      : undefined
  }
  const current = result.records[index - 1]
  return current
    ? {
        kind: 'acting',
        elapsedAV: current.elapsedAV,
        current,
        waiting: queueSnapshot(current.beforeEffects).queue,
      }
    : undefined
}

/** Current records and pending entries retain their own anchor and trace lifetimes. */
export function currentQueueCards(view?: CurrentQueueView) {
  const waiting = (view?.waiting ?? []).map((entry) => ({
    ...entry,
    total: entry.remainingAV,
    delta: 0,
    isCurrent: false,
  }))
  return view?.kind === 'acting'
    ? [{ ...view.current, total: 0, delta: 0, isCurrent: true }, ...waiting]
    : waiting
}
