import { shallowReadonly, shallowRef } from 'vue'
import { simulatePlan } from '../../../engine/action-planner/engine'
import type { SimulationPlan } from '../../../engine/action-planner/types'

/** Page-owned committed input; editor/navigation state belongs to Phase 1B. */
export function useActionPlanner(initialPlan: SimulationPlan) {
  const plan = shallowRef(initialPlan)
  const result = shallowRef(simulatePlan(initialPlan))
  function replacePlan(next: SimulationPlan) {
    plan.value = next
    result.value = simulatePlan(next)
  }
  return { plan: shallowReadonly(plan), result: shallowReadonly(result), replacePlan }
}
