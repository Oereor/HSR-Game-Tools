import { ref } from 'vue'
import type { Task } from '../types'

/** Task edits stay detached from the submitted form until explicitly confirmed. */
export function createTaskSelection(
  tasks: Task[],
  readSelection: () => string[],
  applySelection: (ids: string[]) => void,
) {
  const visible = ref(false)
  const taskIds = ref<string[]>([])
  function open() {
    taskIds.value = [...readSelection()]
    visible.value = true
  }
  function cancel() {
    visible.value = false
    taskIds.value = []
  }
  function confirm() {
    if (!visible.value) return
    applySelection(tasks.filter((task) => taskIds.value.includes(task.id)).map((task) => task.id))
    cancel()
  }
  return {
    visible,
    taskIds,
    open,
    cancel,
    confirm,
    remove: (id: string) => applySelection(readSelection().filter((selected) => selected !== id)),
    selectAll: () => (taskIds.value = tasks.map((task) => task.id)),
    clear: () => (taskIds.value = []),
  }
}
