import { cellKey, sameCell, type Cell } from './engine/map'
import type { boardStatus, Event, GameState, Sheep, Transition } from './engine/step'
import type { GridWindow } from './presentation'

export type BoardStatus = ReturnType<typeof boardStatus>
export type SheepPositions = Pick<GameState, Sheep>
type EnvironmentEvent = Extract<Event, { type: 'controller' | 'platform' | 'portal' }>
type PositionEvent = Extract<Event, { sheep: Sheep; from: Cell }>
export type SheepMotionStage = {
  type: PositionEvent['type'] | 'spawn' | 'lost'
  positions: SheepPositions
}
type MotionStage = SheepMotionStage | { type: 'environment'; events: EnvironmentEvent[] }

export interface ReplayMotionRequest {
  before: GameState
  transition: Transition
  status: BoardStatus
}

export const replaySheep = ['gold', 'black'] as const

export function sameReplayWindow(a: GridWindow, b: GridWindow) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function replayMotionStages(before: GameState, transition: Transition, view: GridWindow) {
  if (
    transition.nextState.turn !== before.turn + 1 ||
    (transition.outcome !== 'stable' && transition.outcome !== 'solved')
  )
    return

  const { events, nextState } = transition
  const stages: MotionStage[] = []
  const positions: SheepPositions = { gold: before.gold, black: before.black }
  let motionCount = 0

  function visible(point: Cell, extraRow = 0) {
    return (
      point.x >= view.x &&
      point.x < view.x + view.width &&
      point.y >= view.y &&
      point.y < view.y + view.height + extraRow
    )
  }

  function addMotion(type: Exclude<MotionStage['type'], 'environment'>) {
    stages.push({ type, positions: { ...positions } })
    motionCount++
  }

  if (replaySheep.some((who) => positions[who] && !visible(positions[who]))) return
  for (let index = 0; index < events.length;) {
    const event = events[index]
    switch (event.type) {
      case 'move':
      case 'fall':
      case 'teleport': {
        const type = event.type
        const moved = new Set<Sheep>()
        const fellOut: Sheep[] = []
        // Each engine batch has at most one event per sheep. A void loss is
        // emitted immediately after its fall, before the other sheep's fall.
        while (index < events.length) {
          const action = events[index]
          if (action.type !== type || moved.has(action.sheep)) break
          if (!sameCell(positions[action.sheep], action.from)) return
          index++

          const next = events[index]
          const voidLoss =
            type === 'fall' &&
            next?.type === 'lost' &&
            next.cause === 'void' &&
            next.sheep === action.sheep &&
            sameCell(next.at, action.to)
          if (!visible(action.to, voidLoss ? 1 : 0)) return
          if (voidLoss) {
            fellOut.push(action.sheep)
            index++
          }
          positions[action.sheep] = action.to
          moved.add(action.sheep)
        }
        addMotion(type)
        if (fellOut.length) {
          for (const who of fellOut) positions[who] = null
          addMotion('lost')
        }
        break
      }
      case 'spawn':
        if (positions.black || !visible(event.at)) return
        positions.black = event.at
        addMotion('spawn')
        index++
        break
      case 'lost':
        if (!sameCell(positions[event.sheep], event.at)) return
        positions[event.sheep] = null
        addMotion('lost')
        index++
        break
      case 'controller':
      case 'platform':
      case 'portal': {
        const last = stages.at(-1)
        if (last?.type === 'environment') last.events.push(event)
        else stages.push({ type: 'environment', events: [event] })
        index++
        break
      }
      case 'goal':
        if (!sameCell(positions.gold, event.at)) return
        index++
        break
      case 'collision':
        return
    }
    if (motionCount > 8) return
  }
  if (
    !motionCount ||
    stages[0]?.type !== 'move' ||
    replaySheep.some(
      (who) => positions[who] !== nextState[who] && !sameCell(positions[who], nextState[who]),
    )
  )
    return
  return stages
}

export function replayEnvironment(status: BoardStatus, events: EnvironmentEvent[]): BoardStatus {
  const pressed = new Set(status.pressed)
  const platforms = status.platforms.map((group) => [...group])
  const portals = new Set(status.portals)
  for (const event of events) {
    switch (event.type) {
      case 'controller':
        if (event.pressed) pressed.add(cellKey(event.at))
        else pressed.delete(cellKey(event.at))
        break
      case 'platform':
        platforms[event.group][event.platform] = event.enabled
        break
      case 'portal':
        if (event.open) portals.add(event.pair)
        else portals.delete(event.pair)
        break
    }
  }
  return { pressed, platforms, portals }
}

export function createReplayPlayback() {
  let current: AbortController | undefined

  function cancel() {
    if (!current) return false
    const previous = current
    current = undefined
    previous.abort()
    return true
  }

  return {
    cancel,
    async play(
      stages: MotionStage[],
      render: (stage: MotionStage, signal: AbortSignal) => Promise<void>,
      finish: () => void,
    ) {
      if (cancel()) return
      const playback = new AbortController()
      current = playback
      try {
        for (const stage of stages) {
          if (playback.signal.aborted) break
          await render(stage, playback.signal)
        }
      } finally {
        if (current === playback) {
          current = undefined
          finish()
        }
      }
    },
  }
}
