import { describe, expect, it } from 'vitest'
import { buildModel } from '../../../src/tools/currency-wars/model'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import { lineupSignature } from '../../../src/tools/currency-wars/signature'
import {
  highsSolver,
  solveCurrencyWarsBatch,
  type Solver,
} from '../../../src/tools/currency-wars/solve'
import type { Lineup } from '../../../src/tools/currency-wars/types'
import { navigator, request, role, task, toy } from './helpers'

describe('complete configuration search', () => {
  it('canonicalizes member and emblem ordering, but preserves assignments, forms and targets', () => {
    const a: Lineup = {
      members: [
        { formId: '1', emblemIds: [2, 1] },
        { formId: '2', emblemIds: [], navigatorTarget: '1' },
      ],
    }
    expect(lineupSignature(a)).toBe(
      lineupSignature({
        members: [
          { formId: '2', emblemIds: [], navigatorTarget: '1' },
          { formId: '1', emblemIds: [1, 2] },
        ],
      }),
    )
    for (const variant of [
      {
        members: [
          { formId: '1', emblemIds: [1] },
          { formId: '2', emblemIds: [2], navigatorTarget: '1' },
        ],
      },
      {
        members: [
          { formId: '1', emblemIds: [1, 2] },
          { formId: '3', emblemIds: [], navigatorTarget: '1' },
        ],
      },
      {
        members: [
          { formId: '1', emblemIds: [1, 2] },
          { formId: '2', emblemIds: [], navigatorTarget: '3' },
        ],
      },
    ])
      expect(lineupSignature(a)).not.toBe(lineupSignature(variant))
  })

  it('matches an exhaustive tiny oracle, ranks by emblems and excludes configurations at the solver layer', async () => {
    const snapshot = toy([role(1, [2007]), role(2, [2008])], [2007, 2008])
    const input = request([task(2007, 2)], { slots: 2, emblemBudget: 2 })
    const oracle: { signature: string; objective: number }[] = []
    // Only one useful emblem exists for each role; enumerate every selection and equipment bit.
    for (let mask = 0; mask < 16; mask++) {
      const lineup: Lineup = { members: [] }
      if (mask & 1) lineup.members.push({ formId: '1', emblemIds: mask & 4 ? [502008] : [] })
      else if (mask & 4) continue
      if (mask & 2) lineup.members.push({ formId: '2', emblemIds: mask & 8 ? [502007] : [] })
      else if (mask & 8) continue
      const evaluation = evaluateLineup(snapshot, input, lineup)
      if (evaluation.valid && evaluation.completedCount === 1)
        oracle.push({ signature: lineupSignature(lineup), objective: evaluation.objective })
    }
    oracle.sort((a, b) => b.objective - a.objective)
    const observed: string[] = []
    const solver: Solver = async (model, limit) => {
      const outcome = await highsSolver(model, limit)
      if (outcome.feasible) {
        // All earlier configurations must violate at least one newly added complete cut.
        for (const signature of observed) {
          const lineup: Lineup = {
            members: (JSON.parse(signature) as [string, number[], string | null][]).map(
              ([formId, emblemIds, target]) => ({
                formId,
                emblemIds,
                ...(target ? { navigatorTarget: target } : {}),
              }),
            ),
          }
          const selected = new Map(lineup.members.map((m) => [m.formId, m]))
          const bits = new Map<string, number>()
          for (const [id, v] of model.roleColumns) {
            bits.set(v, selected.has(id) ? 1 : 0)
            for (const [eid, column] of model.emblemColumns.get(id)!)
              bits.set(column, selected.get(id)?.emblemIds.includes(eid) ? 1 : 0)
          }
          expect(
            model.constraints.some(
              (row) =>
                [...row.expression.keys()].every((v) => bits.has(v)) &&
                row.relation === '>=' &&
                [...row.expression].reduce((n, [v, c]) => n + c * bits.get(v)!, 0) < row.rhs,
            ),
          ).toBe(true)
        }
      }
      return outcome
    }
    const tracking: Solver = async (model, limit) => {
      const outcome = await solver(model, limit)
      if (outcome.feasible)
        observed.push(
          lineupSignature({
            members: [...model.roleColumns]
              .filter(([, v]) => outcome.values[v]! > 0.5)
              .map(([formId]) => ({
                formId,
                emblemIds: [...model.emblemColumns.get(formId)!]
                  .filter(([, v]) => outcome.values[v]! > 0.5)
                  .map(([id]) => id),
              })),
          }),
        )
      return outcome
    }
    const batch = await solveCurrencyWarsBatch(snapshot, input, tracking)
    expect(batch.status, batch.message).toBe('optimal')
    expect(batch.solutions).toHaveLength(oracle.length)
    expect(batch.solutions.map((s) => s.evaluation.objective)).toEqual(
      oracle.map((s) => s.objective),
    )
    expect(new Set(batch.solutions.map((s) => s.signature))).toEqual(
      new Set(oracle.map((s) => s.signature)),
    )
    expect(batch.termination).toBe('exhausted')
    expect(batch.maximumCompletedProven).toBe(true)
    expect(batch.solutions.map((s) => s.originalOptimal)).toEqual([true, false])
    expect(batch.solutions.every((s) => evaluateLineup(snapshot, input, s.lineup).valid)).toBe(true)
  })

  it('returns one, two, or at most three real configurations, never fills with lower counts', async () => {
    for (const size of [1, 2, 4]) {
      const snapshot = toy(Array.from({ length: size }, (_, i) => role(i + 1, [2007])))
      const batch = await solveCurrencyWarsBatch(snapshot, request([task(2007, 1)], { slots: 1 }))
      expect(batch.solutions, batch.message).toHaveLength(Math.min(size, 3))
      expect(new Set(batch.solutions.map((s) => s.signature)).size).toBe(batch.solutions.length)
      expect(batch.solutions.every((s) => s.evaluation.completedCount === 1)).toBe(true)
    }
  })

  it('ranks three independently verified configurations without copying target emblem Classes', async () => {
    const snapshot = toy([navigator, role(1, [1001, 2007])], [2007, 2008])
    const input = request([task(2007, 2), task(2008, 2)], { emblemBudget: 1 })
    const batch = await solveCurrencyWarsBatch(snapshot, input)
    expect(batch.status, batch.message).toBe('optimal')
    expect(batch.solutions).toHaveLength(3)
    expect(new Set(batch.solutions.map((s) => s.signature)).size).toBe(3)
    expect(batch.maximumCompletedProven).toBe(true)
    expect(batch.minimumEmblemsProven).toBe(true)
    expect(batch.solutions.map((s) => s.evaluation.objective)).toEqual([7, 6, 6])
    for (const solution of batch.solutions) {
      const independent = evaluateLineup(snapshot, input, solution.lineup)
      expect(independent.valid, independent.errors.join('; ')).toBe(true)
      expect(independent).toEqual(solution.evaluation)
      expect(independent.completedCount).toBe(1)
      expect(independent.tasks.find((t) => t.traitId === 2008)!.completed).toBe(false)
      expect(independent.traits.find((t) => t.traitId === 2008)!.count).toBeLessThanOrEqual(1)
      const himeko = independent.members.find((m) => m.formId === navigator.id)!
      expect(himeko.extraTraits).not.toContain(2008)
    }
  })

  it('accepts the same roster with different emblem assignments and different navigator targets', async () => {
    const snapshot = toy([role(1, [2007]), role(2, [2007])], [2008])
    const batch = await solveCurrencyWarsBatch(
      snapshot,
      request([task(2007, 2), task(2008, 1)], { slots: 2, emblemBudget: 1 }),
    )
    expect(batch.solutions, batch.message).toHaveLength(2)
    expect(
      batch.solutions.every((s) => s.lineup.members.length === 2 && s.evaluation.emblemCount === 1),
    ).toBe(true)
    const navSnapshot = toy([navigator, role(1, [1001, 2007]), role(2, [1001, 2007])])
    const navBatch = await solveCurrencyWarsBatch(
      navSnapshot,
      request([task(2007, 3)], { slots: 3 }),
    )
    expect(navBatch.solutions, navBatch.message).toHaveLength(2)
    expect(
      new Set(
        navBatch.solutions.map(
          (s) => s.lineup.members.find((m) => m.formId === navigator.id)!.navigatorTarget,
        ),
      ),
    ).toEqual(new Set(['1', '2']))
  })

  it('handles the only empty lineup without constructing a contradictory constant cut', async () => {
    const batch = await solveCurrencyWarsBatch(toy(), request([task(2007, 1)]))
    expect(batch.status, batch.message).toBe('optimal')
    expect(batch.solutions).toHaveLength(1)
    expect(batch.termination).toBe('exhausted')
  })
})

describe('deadline, quality and proof scopes', () => {
  it('shares the deadline, reserves later rounds, and never equates limited subproblems with a proof', async () => {
    const snapshot = toy([role(1, [2007]), role(2, [2007]), role(3, [2007])])
    const input = request([task(2007, 1), task(2008, 1)], { slots: 1, timeLimitSeconds: 30 })
    let clock = 0
    const limits: number[] = []
    const solver: Solver = async (model, limit) => {
      limits.push(limit)
      const solved = await highsSolver(model, limit)
      clock += limit * 1000
      return { ...solved, status: 'limited', solverStatus: 'timeLimit' }
    }
    const batch = await solveCurrencyWarsBatch(snapshot, input, solver, { now: () => clock })
    expect(limits).toEqual([22.5, 3.75, 3.75])
    expect(batch.totalElapsedSeconds).toBe(30)
    expect(batch.solutions).toHaveLength(3)
    expect(batch.maximumCompletedProven).toBe(false)
    expect(batch.minimumEmblemsProven).toBe(false)
    expect(batch.status).toBe('feasible')
  })

  it('uses the remaining time to recover from an initial search with no incumbent', async () => {
    let clock = 0
    const limits: number[] = []
    const solver: Solver = async (model, limit) => {
      limits.push(limit)
      clock += limit * 1000
      if (limits.length === 1)
        return {
          status: 'limited',
          solverStatus: 'timeLimit',
          feasible: false,
          values: {},
          objective: NaN,
        }
      return highsSolver(model, limit)
    }
    const batch = await solveCurrencyWarsBatch(
      toy([role(1, [2007])]),
      request([task(2007, 1)], { timeLimitSeconds: 30 }),
      solver,
      { now: () => clock },
    )
    expect(limits).toEqual([22.5, 7.5])
    expect(batch.solutions, batch.message).toHaveLength(1)
    expect(batch.termination).toBe('budget')
  })

  it('drops earlier lower-count incumbents when a later round improves the known lower bound', async () => {
    const snapshot = toy([role(1, [2007]), role(2, [2008])])
    const input = request([task(2007, 1), task(2008, 1)], { slots: 2 })
    let calls = 0
    const solver: Solver = async (model, limit) => {
      if (calls++ === 0) {
        const forced = {
          ...model,
          lp: model.lp.replace(
            'Binary\n',
            ` force_second_off: + 1 ${model.roleColumns.get('2')} = 0\nBinary\n`,
          ),
        }
        return {
          ...(await highsSolver(forced, limit)),
          status: 'limited',
          solverStatus: 'timeLimit',
        }
      }
      return highsSolver(model, limit)
    }
    const batch = await solveCurrencyWarsBatch(snapshot, input, solver)
    expect(batch.stages.map((s) => s.completedCount)).toEqual([1, 2, undefined])
    expect(batch.solutions, batch.message).toHaveLength(1)
    expect(batch.solutions[0]!.evaluation.completedCount).toBe(2)
    expect(batch.maximumCompletedProven).toBe(true)
  })

  it('rejects forged excluded columns and returns an error rather than an invalid partial batch', async () => {
    let previous: Awaited<ReturnType<Solver>>
    let calls = 0
    const solver: Solver = async (model, limit) => {
      if (calls++ === 0) previous = await highsSolver(model, limit)
      return previous!
    }
    const batch = await solveCurrencyWarsBatch(
      toy([role(1, [2007]), role(2, [2007])]),
      request([task(2007, 1)], { slots: 1 }),
      solver,
    )
    expect(batch.status).toBe('error')
    expect(batch.message).toMatch(/constraint|excluded/)
    expect(batch.solutions).toEqual([])
  })

  it('preserves a validated incumbent at budget expiry and counts setup overhead before starting', async () => {
    let clock = 0
    const solver: Solver = async (model, limit) => {
      const result = await highsSolver(model, limit)
      clock = 31000
      return result
    }
    const batch = await solveCurrencyWarsBatch(
      toy([role(1, [2007])]),
      request([task(2007, 1)], { timeLimitSeconds: 30 }),
      solver,
      { now: () => clock },
    )
    expect(batch.solutions).toHaveLength(1)
    expect(batch.termination).toBe('budget')
    let used = false
    let tick = 0
    const expired = await solveCurrencyWarsBatch(
      toy(),
      request([task(2007, 1)], { timeLimitSeconds: 1 }),
      async () => {
        used = true
        throw new Error()
      },
      { now: () => tick++ * 2000 },
    )
    expect(used).toBe(false)
    expect(expired.status).toBe('no-result')
  })

  it('constructs no-good cuts without putting task or auxiliary columns in the cut', () => {
    const snapshot = toy([navigator, role(1, [1001, 2007])], [2008])
    const input = request([task(2007, 2)])
    const base = buildModel(snapshot, input)
    const model = buildModel(snapshot, input, {
      excluded: [{ members: [{ formId: '1', emblemIds: [] }] }],
    })
    const config = new Set([
      ...model.roleColumns.values(),
      ...[...model.emblemColumns.values()].flatMap((m) => [...m.values()]),
      ...[...model.targetColumns.values()].flatMap((m) => [...m.values()]),
    ])
    const cut = model.constraints.at(-1)!
    expect(model.rowCount).toBe(base.rowCount + 1)
    expect(new Set(cut.expression.keys())).toEqual(config)
    expect([...model.taskColumns.values()].every((v) => !cut.expression.has(v))).toBe(true)
  })
})
