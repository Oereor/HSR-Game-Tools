import { expect, it, vi } from 'vitest'
import {
  createSearchSession,
  type SolveReply,
  type WorkerPort,
} from '../../../src/tools/golden-scapegoat/browser/session'
import { demos } from '../../fixtures/golden-scapegoat/demo-maps'
import { defaultLimits } from '../../../src/tools/golden-scapegoat/engine/solve'

function worker() {
  return {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  } satisfies WorkerPort
}

it('terminates on cancel and discards old or mismatched Worker messages', () => {
  const first: WorkerPort = worker()
  const second: WorkerPort = worker()
  const targets = [first, second]
  const session = createSearchSession(() => targets.shift()!)
  session.start(demos.platform, defaultLimits)
  const savedCallback = first.onmessage!
  session.cancel()
  expect(first.terminate).toHaveBeenCalledOnce()
  expect(session.status.value).toEqual({ status: 'cancelled' })

  session.start(demos.portal, defaultLimits)
  const reply = (id: number) =>
    ({ data: { id, result: { status: 'unsolvable', visited: 2 } } }) as MessageEvent<SolveReply>
  savedCallback(reply(1))
  second.onmessage!(reply(1))
  expect(session.status.value).toEqual({ status: 'searching' })
  second.onmessage!(reply(2))
  expect(second.terminate).toHaveBeenCalledOnce()
  expect(session.status.value).toEqual({ status: 'unsolvable', visited: 2 })
})

it('clears an active attempt on map edits or unmount and reports startup errors separately', () => {
  const port: WorkerPort = worker()
  const session = createSearchSession(() => port)
  session.start(demos.platform, defaultLimits)
  session.reset()
  expect(port.terminate).toHaveBeenCalledOnce()
  expect(session.status.value).toEqual({ status: 'idle' })

  const unavailable = createSearchSession(() => {
    throw new Error('Worker not available')
  })
  unavailable.start(demos.platform, defaultLimits)
  expect(unavailable.status.value).toEqual({ status: 'workerError' })
})
