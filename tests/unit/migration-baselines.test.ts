import { describe, it, expect } from 'vitest'
import { simulatePlan } from '../../src/engine/action-planner/engine'
import { cases, projectResult } from '../fixtures/action-planner-cases'
import expected from '../fixtures/action-planner-expected.json'
describe('fixed develop engine equivalence', () => {
  it.each(Object.entries(cases))('%s', (name, plan) => {
    expect(JSON.parse(JSON.stringify(projectResult(simulatePlan(plan))))).toEqual(
      expected.results[name as keyof typeof expected.results],
    )
  })
})
