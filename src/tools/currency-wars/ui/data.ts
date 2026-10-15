import rawSnapshot from '../../../../data/currency-wars/snapshot.json'
import rawTasks from '../../../../data/currency-wars/tasks.json'
import rawVisuals from '../../../../data/currency-wars/visuals.json'
import { assertSnapshot, parseTasks } from '../validation'
import { assertVisualCatalog } from './visuals'

export function loadPageData() {
  assertSnapshot(rawSnapshot)
  const tasks = parseTasks(rawTasks, rawSnapshot)
  assertVisualCatalog(rawVisuals, rawSnapshot)
  return { snapshot: rawSnapshot, tasks, visuals: rawVisuals }
}
