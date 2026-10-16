import { isProxy } from 'vue'
import { describe, expect, it } from 'vitest'
import { createCurrencyWarsSession } from '../../../src/tools/currency-wars/ui/session'
import { createTaskSelection } from '../../../src/tools/currency-wars/ui/task-selection'
import { resultSummary } from '../../../src/tools/currency-wars/ui/result-summary'
import { loadPageData } from '../../../src/tools/currency-wars/ui/data'
import type {
  WorkerPort,
  SolveMessage,
  ResultMessage,
} from '../../../src/tools/currency-wars/browser/protocol'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import type { OptimizationResult } from '../../../src/tools/currency-wars/types'
import { role, task, toy } from './helpers'

class FakeWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  onmessageerror: WorkerPort['onmessageerror'] = null
  messages: SolveMessage[] = []
  terminated = false
  postMessage(message: SolveMessage) {
    this.messages.push(message)
  }
  terminate() {
    this.terminated = true
  }
  emit(result: OptimizationResult, id = this.messages[0]!.requestId) {
    this.onmessage?.({ data: { requestId: id, result } } as MessageEvent<ResultMessage>)
  }
}
const snapshot = toy([role(1, [2007]), role(2, [2008])])
const tasks = [task(2007, 1), task(2008, 1)]
function setup() {
  const workers: FakeWorker[] = []
  const session = createCurrencyWarsSession(snapshot, tasks, () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  const good = (index = workers.length - 1): OptimizationResult => {
    const request = workers[index]!.messages[0]!.request
    const lineup = {
      members: [
        { formId: '1', emblemIds: [] },
        { formId: '2', emblemIds: [] },
      ],
    }
    return {
      status: 'optimal',
      elapsedSeconds: 0.25,
      lineup,
      evaluation: evaluateLineup(snapshot, request, lineup),
    }
  }
  return { session, workers, good }
}

describe('currency-wars page session', () => {
  it('keeps the displayed summary tied to its request through form edits and failed or cancelled runs', () => {
    const { session, workers, good } = setup()
    session.start()
    workers[0]!.emit(good())
    const displayed = () => resultSummary(session.lastValid.value!)
    expect(displayed()).toEqual({ completed: 2, tasks: 2, emblems: 0, budget: 12 })
    session.form.taskIds = [tasks[0]!.id]
    session.form.emblemBudget = 20
    expect(session.stale.value).toBe(true)
    session.start()
    session.cancel()
    expect(displayed()).toEqual({ completed: 2, tasks: 2, emblems: 0, budget: 12 })
    session.start()
    workers[2]!.emit({ status: 'no-result', elapsedSeconds: 0.1 })
    expect(displayed()).toEqual({ completed: 2, tasks: 2, emblems: 0, budget: 12 })
    session.dispose()
  })

  it('removes and reselects tasks independently when one trait has multiple thresholds', () => {
    const sameTrait = [task(2007, 1, 'low'), task(2007, 2, 'high')]
    const session = createCurrencyWarsSession(snapshot, sameTrait, () => new FakeWorker())
    const selection = createTaskSelection(
      sameTrait,
      () => session.form.taskIds,
      (ids) => {
        session.form.taskIds = ids
      },
    )
    selection.remove('low')
    expect(session.form.taskIds).toEqual(['high'])
    selection.open()
    expect(selection.taskIds.value).toEqual(['high'])
    selection.selectAll()
    selection.cancel()
    expect(session.form.taskIds).toEqual(['high'])
    selection.open()
    selection.selectAll()
    selection.confirm()
    expect(session.form.taskIds).toEqual(['low', 'high'])
    selection.remove('high')
    selection.remove('low')
    expect(session.errors.value).toContain('taskIds')
    expect(session.start()).toBe(false)
    session.dispose()
  })

  it('reports a new invalid attempt instead of retaining the preceding cancellation notice', () => {
    const { session, workers } = setup()
    session.start()
    session.cancel()
    session.form.taskIds = []
    expect(session.start()).toBe(false)
    expect(session.cancelled.value).toBe(false)
    expect(session.failure.value).toBe('input')
    expect(workers).toHaveLength(1)
  })
  it('preserves the default parameters and stable task IDs', () => {
    const { session } = setup()
    expect(session.form).toMatchObject({
      slots: 13,
      emblemBudget: 12,
      timeLimitSeconds: 30,
      includeExperts: false,
      taskIds: tasks.map((t) => t.id),
    })
    session.form.taskIds = []
    expect(session.start()).toBe(false)
    expect(session.errors.value).toContain('taskIds')
    session.form.taskIds = [tasks[1]!.id]
    expect(session.form.taskIds).toEqual([tasks[1]!.id])
    session.dispose()
  })

  it('edits all 25 formal tasks in a detached draft and discards cancelled or closed changes', () => {
    const data = loadPageData()
    const session = createCurrencyWarsSession(data.snapshot, data.tasks, () => new FakeWorker())
    const selection = createTaskSelection(
      data.tasks,
      () => session.form.taskIds,
      (ids) => {
        session.form.taskIds = ids
      },
    )
    const original = [...session.form.taskIds]
    selection.open()
    expect(selection.taskIds.value).toEqual(original)
    expect(selection.taskIds.value).not.toBe(session.form.taskIds)
    selection.taskIds.value.splice(0, 1)
    expect(session.form.taskIds).toEqual(original)
    selection.clear()
    expect(selection.taskIds.value).toEqual([])
    selection.selectAll()
    expect(selection.taskIds.value).toEqual(data.tasks.map((task) => task.id))
    expect(selection.taskIds.value).toHaveLength(25)
    selection.clear()
    selection.cancel()
    expect(selection.visible.value).toBe(false)
    expect(session.form.taskIds).toEqual(original)
    selection.open()
    expect(selection.taskIds.value).toEqual(original)
    selection.cancel()
    session.dispose()
  })

  it('keeps the current result fresh until a changed task draft is confirmed, then submits the confirmed tasks', () => {
    const { session, workers, good } = setup()
    const selection = createTaskSelection(
      tasks,
      () => session.form.taskIds,
      (ids) => {
        session.form.taskIds = ids
      },
    )
    session.start()
    workers[0]!.emit(good())
    const previous = session.lastValid.value
    selection.open()
    selection.clear()
    expect(session.stale.value).toBe(false)
    expect(session.errors.value).toEqual([])
    selection.cancel()
    expect(session.lastValid.value).toBe(previous)
    expect(session.stale.value).toBe(false)
    selection.open()
    selection.taskIds.value.reverse()
    selection.confirm()
    expect(session.stale.value).toBe(false)
    selection.open()
    selection.taskIds.value = [tasks[1]!.id]
    const draft = selection.taskIds.value
    selection.confirm()
    expect(selection.visible.value).toBe(false)
    expect(session.form.taskIds).toEqual([tasks[1]!.id])
    selection.confirm()
    expect(session.form.taskIds).toEqual([tasks[1]!.id])
    expect(session.form.taskIds).not.toBe(draft)
    expect(session.stale.value).toBe(true)
    expect(session.lastValid.value).toBe(previous)
    expect(previous!.request.tasks).toEqual(tasks)
    expect(session.start()).toBe(true)
    expect(workers[1]!.messages[0]!.request.tasks).toEqual([tasks[1]])
    workers[1]!.emit(good())
    expect(session.stale.value).toBe(false)
    session.dispose()
  })

  it('rejects an empty confirmed selection without losing the valid result and can select all again', () => {
    const { session, workers, good } = setup()
    const selection = createTaskSelection(
      tasks,
      () => session.form.taskIds,
      (ids) => {
        session.form.taskIds = ids
      },
    )
    session.start()
    workers[0]!.emit(good())
    const previous = session.lastValid.value
    selection.open()
    selection.clear()
    selection.confirm()
    expect(session.form.taskIds).toEqual([])
    expect(session.stale.value).toBe(true)
    expect(session.errors.value).toContain('taskIds')
    expect(session.start()).toBe(false)
    expect(workers).toHaveLength(1)
    expect(session.lastValid.value).toBe(previous)
    selection.open()
    selection.selectAll()
    selection.confirm()
    expect(session.stale.value).toBe(false)
    expect(session.start()).toBe(true)
    expect(workers[1]!.messages[0]!.request.tasks).toEqual(tasks)
    session.dispose()
  })

  it('copies the exact request and snapshot into one Worker and prevents duplicate starts', () => {
    const { session, workers, good } = setup()
    session.form.slots = 11
    session.form.emblemBudget = Number.MAX_SAFE_INTEGER
    session.form.includeExperts = true
    session.form.timeLimitSeconds = 7
    expect(session.start()).toBe(true)
    expect(session.start()).toBe(false)
    expect(workers).toHaveLength(1)
    const sent = workers[0]!.messages[0]!
    expect(sent.request).toEqual({
      slots: 11,
      emblemBudget: Number.MAX_SAFE_INTEGER,
      includeExperts: true,
      timeLimitSeconds: 7,
      tasks,
    })
    expect(sent.snapshot).toEqual(snapshot)
    expect(sent.snapshot).not.toBe(snapshot)
    expect(isProxy(sent.request)).toBe(false)
    session.form.taskIds = [tasks[0]!.id]
    expect(sent.request.tasks).toHaveLength(2)
    workers[0]!.emit(good())
    expect(session.lastValid.value!.request.tasks).toHaveLength(2)
    expect(session.stale.value).toBe(true)
    expect(workers[0]!.terminated).toBe(true)
    expect(session.busy.value).toBe(false)
  })

  it.each([
    ['slots', null],
    ['slots', 10],
    ['emblemBudget', null],
    ['emblemBudget', 11],
    ['emblemBudget', 12.5],
    ['timeLimitSeconds', 0],
    ['timeLimitSeconds', 1.5],
  ] as const)('rejects invalid %s=%s before starting a Worker', (field, value) => {
    const { session, workers } = setup()
    session.form[field] = value
    expect(session.start()).toBe(false)
    expect(workers).toHaveLength(0)
    expect(session.errors.value).toContain(field)
  })

  it('keeps a successful result with its submitted conditions and marks only configuration changes stale', () => {
    const { session, workers, good } = setup()
    session.start()
    workers[0]!.emit(good())
    expect(session.stale.value).toBe(false)
    session.form.taskIds.reverse()
    expect(session.stale.value).toBe(false)
    session.form.emblemBudget = 18
    expect(session.stale.value).toBe(true)
    session.form.emblemBudget = 12
    expect(session.stale.value).toBe(false)
    session.form.emblemBudget = null
    expect(session.stale.value).toBe(true)
    expect(session.lastValid.value!.request.emblemBudget).toBe(12)
  })

  it('cancels, releases and restarts while ignoring old and out-of-order responses', () => {
    const { session, workers, good } = setup()
    session.start()
    const late = workers[0]!.onmessage!
    session.cancel()
    expect(workers[0]!.terminated).toBe(true)
    expect(session.cancelled.value).toBe(true)
    session.start()
    late({ data: { requestId: 1, result: good(0) } } as MessageEvent<ResultMessage>)
    expect(session.lastValid.value).toBeUndefined()
    workers[1]!.emit(good(1), 1)
    expect(session.busy.value).toBe(true)
    workers[1]!.emit(good(1))
    expect(session.lastValid.value!.requestId).toBe(2)
    expect(session.cancelled.value).toBe(false)
  })

  it.each(['feasible', 'no-result', 'infeasible', 'error', 'empty'] as const)(
    'preserves status %s and does not replace an earlier valid lineup with an invalid attempt',
    (status) => {
      const { session, workers, good } = setup()
      session.start()
      workers[0]!.emit(good())
      const previous = session.lastValid.value
      session.start()
      workers[1]!.emit(
        status === 'feasible' ? { ...good(), status } : { status, elapsedSeconds: 0.1 },
      )
      expect(session.lastAttempt.value!.result.status).toBe(status)
      if (status === 'feasible') expect(session.lastValid.value!.result.status).toBe('feasible')
      else {
        expect(session.lastValid.value).toBe(previous)
        expect(session.historical.value).toBe(true)
      }
    },
  )

  it('handles unavailable Workers, runtime and message errors, malformed results and disposal', () => {
    const unavailable = createCurrencyWarsSession(snapshot, tasks, () => {
      throw new Error('unavailable')
    })
    expect(unavailable.start()).toBe(false)
    expect(unavailable.failure.value).toBe('unavailable')
    for (const kind of ['runtime', 'message', 'malformed'] as const) {
      const { session, workers } = setup()
      session.start()
      if (kind === 'runtime') workers[0]!.onerror!({ preventDefault() {} } as ErrorEvent)
      if (kind === 'message') workers[0]!.onmessageerror!({} as MessageEvent)
      if (kind === 'malformed') workers[0]!.emit({ status: 'optimal', elapsedSeconds: 1 })
      expect(session.failure.value).toBe(kind === 'runtime' ? 'runtime' : 'message')
      expect(session.lastValid.value).toBeUndefined()
      expect(workers[0]!.terminated).toBe(true)
    }
    const { session, workers, good } = setup()
    session.start()
    const late = workers[0]!.onmessage!
    session.dispose()
    late({ data: { requestId: 1, result: good() } } as MessageEvent<ResultMessage>)
    expect(session.lastAttempt.value).toBeUndefined()
    expect(session.start()).toBe(false)
    expect(workers[0]!.terminated).toBe(true)
  })
})
