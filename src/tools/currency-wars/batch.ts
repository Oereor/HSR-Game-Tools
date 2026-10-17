import { buildModel } from './model'
import { lineupSignature } from './signature'
import { highsSolver, solveOneModel, type Solver } from './solver-core'
import type {
  CandidateSolution,
  Lineup,
  OptimizationBatch,
  OptimizationRequest,
  Snapshot,
} from './types'
import { validateRequest } from './validation'

export interface BatchOptions {
  maxSolutions?: 1 | 2 | 3
  /** Monotonic clock injection for deterministic deadline tests. */
  now?: () => number
}

export async function solveCurrencyWarsBatch(
  snapshot: Snapshot,
  input: OptimizationRequest,
  solver: Solver = highsSolver,
  options: BatchOptions = {},
): Promise<OptimizationBatch> {
  const now = options.now ?? (() => performance.now())
  const start = now()
  const deadline = start + input.timeLimitSeconds * 1000
  const elapsed = () => (now() - start) / 1000
  const request = { ...input, tasks: input.tasks.map((task) => ({ ...task })) }
  const batch: OptimizationBatch = {
    request,
    status: 'no-result',
    solutions: [],
    totalElapsedSeconds: 0,
    termination: 'budget',
    maximumCompletedProven: false,
    minimumEmblemsProven: false,
    stages: [],
  }
  const excluded: Lineup[] = []
  const signatures = new Set<string>()
  const maxSolutions = options.maxSolutions === 1 ? 1 : options.maxSolutions === 2 ? 2 : 3
  let bestCompleted = -1
  let bestObjective = -Infinity
  // Largest objective among configurations removed by cuts, including discarded lower counts.
  let excludedBestObjective = -Infinity
  try {
    validateRequest(snapshot, request)
    if (!request.tasks.length) {
      batch.status = 'empty'
      batch.termination = 'empty'
      return batch
    }
    while (batch.solutions.length < maxSolutions) {
      if (now() >= deadline) break
      const built = buildModel(snapshot, request, {
        excluded,
        ...(batch.maximumCompletedProven
          ? { exactCompleted: bestCompleted }
          : bestCompleted >= 0
            ? { minimumCompleted: bestCompleted }
            : {}),
      })
      const remaining = Math.max(0, (deadline - now()) / 1000)
      if (!remaining) break
      const fraction =
        maxSolutions === 1 || (batch.stages.length > 0 && !batch.solutions.length)
          ? 1
          : batch.stages.length === 0
            ? 0.75
            : batch.solutions.length === 1
              ? 0.5
              : 1
      const allocatedSeconds = remaining * fraction
      const stageStart = now()
      const result = await solveOneModel(snapshot, request, built, solver, allocatedSeconds)
      batch.stages.push({
        index: batch.stages.length + 1,
        allocatedSeconds,
        elapsedSeconds: (now() - stageStart) / 1000,
        solverStatus: result.solverStatus ?? result.status,
        completedCount: result.evaluation?.completedCount,
        emblemCount: result.evaluation?.emblemCount,
        objectiveBound: result.objectiveBound,
        gap: result.gap,
      })
      if (result.status === 'error') throw new Error(result.message ?? 'Solver error')
      if (result.status === 'infeasible') {
        batch.termination = 'exhausted'
        if (bestCompleted >= 0) {
          // All excluded configurations are known; the remaining domain above the floor is empty.
          batch.maximumCompletedProven = true
          batch.minimumEmblemsProven = true
        } else batch.status = 'infeasible'
        break
      }
      if (!result.lineup || !result.evaluation) {
        // Retry once with all remaining time when a limited search found no incumbent.
        if (batch.stages.length === 1 && now() < deadline) continue
        break
      }
      const signature = lineupSignature(result.lineup)
      if (signatures.has(signature)) throw new Error('Solver returned an excluded configuration')
      const evaluation = result.evaluation
      if (evaluation.completedCount < bestCompleted)
        throw new Error('Solver violated candidate quality floor')
      if (evaluation.completedCount > bestCompleted) {
        bestCompleted = evaluation.completedCount
        batch.solutions = []
      }
      bestObjective = Math.max(bestObjective, evaluation.objective)
      if (result.status === 'optimal') {
        // The original domain is the union of this search space, the excluded configurations,
        // and configurations below the quality floor. The latter cannot improve the objective.
        batch.maximumCompletedProven = true
        batch.minimumEmblemsProven =
          Math.max(excludedBestObjective, evaluation.objective) === bestObjective
      }
      if (bestCompleted === request.tasks.length) batch.maximumCompletedProven = true
      const candidate: CandidateSolution = {
        id: 'solution-' + (excluded.length + 1),
        signature,
        lineup: result.lineup,
        evaluation,
        solverStatus: result.solverStatus!,
        subproblemOptimal: result.status === 'optimal',
        originalOptimal: false,
        elapsedSeconds: (now() - stageStart) / 1000,
        foundAtSeconds: elapsed(),
        objectiveBound: result.objectiveBound,
        gap: result.gap,
      }
      batch.firstCandidateSeconds ??= candidate.foundAtSeconds
      batch.solutions.push(candidate)
      signatures.add(signature)
      excluded.push(result.lineup)
      excludedBestObjective = Math.max(excludedBestObjective, evaluation.objective)
      if (batch.solutions.length === maxSolutions) batch.termination = 'complete'
      else if (!built.roleColumns.size) {
        // The only configuration is the empty lineup; avoid a constant contradictory cut.
        batch.termination = 'exhausted'
        break
      }
    }
  } catch (error) {
    batch.status = 'error'
    batch.termination = 'error'
    batch.message = error instanceof Error ? error.message : String(error)
    // Errors never publish a partially checked batch over the previous valid UI result.
    batch.solutions = []
  } finally {
    batch.totalElapsedSeconds = elapsed()
  }
  if (batch.solutions.length) {
    batch.maximumCompleted = bestCompleted
    batch.solutions.sort(
      (a, b) =>
        b.evaluation.completedCount - a.evaluation.completedCount ||
        a.evaluation.emblemCount - b.evaluation.emblemCount,
    )
    batch.status =
      batch.maximumCompletedProven && batch.minimumEmblemsProven ? 'optimal' : 'feasible'
    for (const solution of batch.solutions)
      solution.originalOptimal =
        batch.status === 'optimal' && solution.evaluation.objective === bestObjective
  }
  return batch
}
