/** Register only reviewed planner exports accepted by the document reader. */
export interface PlannerTemplate {
  id: string
  order: number
  nameKey: string
  descriptionKey: string
  conditionKey?: string
  gameVersion?: string
  file: unknown
}
export const plannerTemplates: readonly PlannerTemplate[] = []
