import type { SolvedAttempt } from './session'
import type { CandidateSolution } from '../types'

/** Totals belong to the displayed attempt, never to the currently editable form. */
export function resultSummary(attempt: SolvedAttempt, solution: CandidateSolution) {
  return {
    completed: solution.evaluation.completedCount,
    tasks: attempt.request.tasks.length,
    emblems: solution.evaluation.emblemCount,
    budget: attempt.request.emblemBudget,
  }
}
