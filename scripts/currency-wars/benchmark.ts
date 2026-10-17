import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHighsSolver, solveCurrencyWarsBatch } from '../../src/tools/currency-wars/solve'
import { loadSnapshot, dataDirectory, projectRoot } from './data'
import { readFile } from 'node:fs/promises'
import type { Task } from '../../src/tools/currency-wars/types'

// Sequential runs: independent runtimes for single and multi, then reuse each for warm samples.
// No performance assertions, networking, or raw upstream data reads.
const snapshot = await loadSnapshot()
const tasks = JSON.parse(await readFile(path.join(dataDirectory, 'tasks.json'), 'utf8')) as Task[]
const records = []
const output = path.join(projectRoot, '.cache/currency-wars-issue-4-benchmark.json')
await mkdir(path.dirname(output), { recursive: true })
for (const emblemBudget of [12, 20]) {
  for (const subset of ['all', 'first-five'] as const) {
    const solvers = { single: createHighsSolver(), multi: createHighsSolver() }
    for (let repeat = 1; repeat <= 3; repeat++) {
      for (const mode of (repeat % 2 ? ['single', 'multi'] : ['multi', 'single']) as (
        'single' | 'multi'
      )[]) {
        const batch = await solveCurrencyWarsBatch(
          snapshot,
          {
            slots: 13,
            emblemBudget,
            includeExperts: false,
            timeLimitSeconds: 30,
            tasks: subset === 'all' ? tasks : tasks.slice(0, 5),
          },
          solvers[mode],
          { maxSolutions: mode === 'single' ? 1 : 3 },
        )
        const record = {
          mode,
          emblemBudget,
          subset,
          repeat,
          initialization: repeat === 1 ? 'cold' : 'warm',
          status: batch.status,
          termination: batch.termination,
          totalElapsedSeconds: batch.totalElapsedSeconds,
          firstCandidateSeconds: batch.firstCandidateSeconds ?? null,
          solutions: batch.solutions.map((s) => ({
            completed: s.evaluation.completedCount,
            emblems: s.evaluation.emblemCount,
            subproblemOptimal: s.subproblemOptimal,
          })),
          maximumCompletedProven: batch.maximumCompletedProven,
          minimumEmblemsProven: batch.minimumEmblemsProven,
          stages: batch.stages,
          message: batch.message,
        }
        records.push(record)
        await writeFile(
          output,
          JSON.stringify(
            { timestamp: new Date().toISOString(), node: process.version, records },
            null,
            2,
          ) + '\n',
        )
        console.log(JSON.stringify(record))
      }
    }
  }
}
