import type { SolvedAttempt } from './session'

/** Totals belong to the displayed attempt, never to the currently editable form. */
export function resultSummary(attempt: SolvedAttempt) {
  return {
    completed: attempt.result.evaluation!.completedCount,
    tasks: attempt.request.tasks.length,
    emblems: attempt.result.evaluation!.emblemCount,
    budget: attempt.request.emblemBudget,
  }
}
