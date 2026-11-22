import {
  directions,
  initialState,
  stateKey,
  step,
  type Board,
  type Direction,
  type Transition,
} from './step'

export const defaultLimits = { states: 100_000, milliseconds: 5000 }
export const maximumLimits = { states: 250_000, milliseconds: 30_000 }
export type SearchLimits = typeof defaultLimits

type LimitedReason = 'states' | 'time' | 'memory'
export type SearchResult = { visited: number } & (
  | { status: 'solved'; actions: Direction[]; frames: Transition[] }
  | { status: 'unsolvable' | 'unsupported_cycle' }
  | { status: 'resource_limit'; reason: LimitedReason }
)

interface Node {
  state: Transition['nextState']
  parent: number
  action?: Direction
}

export function solve(
  board: Board,
  limits = defaultLimits,
  clock = () => performance.now(),
): SearchResult {
  const started = clock()
  const expired = () => clock() - started >= limits.milliseconds
  const initial = initialState(board)
  const limited = (reason: LimitedReason, visited: number): SearchResult => ({
    status: 'resource_limit',
    reason,
    visited,
  })
  if (expired()) return limited('time', 1)
  if (initial.outcome === 'solved')
    return { status: 'solved', actions: [], frames: [initial], visited: 1 }
  if (initial.outcome === 'failed') return { status: 'unsolvable', visited: 1 }
  if (initial.outcome === 'unsupported_cycle') return { status: 'unsupported_cycle', visited: 1 }

  const nodes: Node[] = [{ state: initial.nextState, parent: -1 }]
  const rootKey = stateKey(initial.nextState)
  const visited = new Set([rootKey])
  let keyUnits = rootKey.length
  // Large K values can grow the cost of each retained state even under a small state count.
  const maxKeyUnits = 16 * 1024 * 1024

  function solved(parent: number, terminal: Direction): SearchResult {
    const actions = [terminal]
    for (let i = parent; nodes[i].parent !== -1; i = nodes[i].parent) {
      actions.push(nodes[i].action!)
    }
    actions.reverse()
    const frames = [initial]
    let eventCount = initial.events.length
    for (const action of actions) {
      if (expired()) return limited('time', visited.size)
      const frame = step(board, frames[frames.length - 1].nextState, action)
      frames.push(frame)
      eventCount += frame.events.length
      if (eventCount > 250_000) return limited('memory', visited.size)
    }
    if (expired()) return limited('time', visited.size)
    return { status: 'solved', actions, frames, visited: visited.size }
  }

  let head = 0
  while (head < nodes.length) {
    const nextLayer = nodes.length
    let obstruction: LimitedReason | 'unsupported_cycle' | undefined
    for (; head < nextLayer; head++) {
      for (const action of directions) {
        if (expired()) return limited('time', visited.size)
        const transition = step(board, nodes[head].state, action)
        if (transition.outcome === 'solved') return solved(head, action)
        if (transition.outcome === 'unsupported_cycle') {
          obstruction = 'unsupported_cycle'
        }
        if (obstruction || transition.outcome !== 'stable') continue
        const key = stateKey(transition.nextState)
        if (visited.has(key)) continue
        if (visited.size >= limits.states) obstruction = 'states'
        else if (keyUnits + key.length > maxKeyUnits) obstruction = 'memory'
        else {
          visited.add(key)
          keyUnits += key.length
          nodes.push({ state: transition.nextState, parent: head, action })
        }
      }
    }
    if (expired()) return limited('time', visited.size)
    if (obstruction === 'unsupported_cycle')
      return { status: 'unsupported_cycle', visited: visited.size }
    if (obstruction) return limited(obstruction, visited.size)
  }
  return { status: 'unsolvable', visited: visited.size }
}
