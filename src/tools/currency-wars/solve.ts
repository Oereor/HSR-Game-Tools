import { solveCurrencyWarsBatch } from './batch'
import { highsSolver, type Solver } from './solver-core'
import type { OptimizationRequest, OptimizationResult, Snapshot } from './types'

export { createHighsSolver, highsSolver } from './solver-core'
export type { Solver, SolverOutcome } from './solver-core'
export { solveCurrencyWarsBatch } from './batch'

/** Compatibility entry: one candidate, with the same validation and total budget. */
export async function solveCurrencyWars(
  snapshot: Snapshot,
  request: OptimizationRequest,
  solver: Solver = highsSolver,
): Promise<OptimizationResult> {
  const batch = await solveCurrencyWarsBatch(snapshot, request, solver, { maxSolutions: 1 })
  const solution = batch.solutions[0]
  return {
    status: batch.status,
    elapsedSeconds: batch.totalElapsedSeconds,
    message: batch.message,
    ...(solution
      ? {
          lineup: solution.lineup,
          evaluation: solution.evaluation,
          solverStatus: solution.solverStatus,
          objectiveBound: solution.objectiveBound,
          gap: solution.gap,
        }
      : { solverStatus: batch.stages.at(-1)?.solverStatus }),
  }
}
