import {
  authoredCells,
  cellKey,
  platformEnabled,
  sameCell,
  type Cell,
  type ControlledPlatform,
  type ReadyMap,
} from './map'

export const directions = ['left', 'right', 'up', 'down'] as const
export type Direction = (typeof directions)[number]
export type Sheep = 'gold' | 'black'
export type Phase = 'recording' | 'replaying' | 'postReplay'

export interface GameState {
  gold: Cell | null
  black: Cell | null
  openPortals: readonly number[]
  phase: Phase
  /** The recorded prefix, or only the unconsumed suffix while replaying. */
  history: readonly Direction[]
  turn: number
}

export type Event =
  | { type: 'move' | 'fall' | 'teleport'; sheep: Sheep; from: Cell; to: Cell }
  | { type: 'spawn'; at: Cell }
  | { type: 'lost'; sheep: Sheep; at: Cell; cause: 'void' | 'portalLoop' }
  | { type: 'controller'; at: Cell; pressed: boolean }
  | { type: 'platform'; group: number; platform: number; enabled: boolean }
  | { type: 'portal'; pair: number; open: boolean }
  | { type: 'collision' | 'goal'; at: Cell }
export type Outcome = 'stable' | 'invalid' | 'solved' | 'failed' | 'unsupported_cycle'

export interface Transition {
  nextState: GameState
  outcome: Outcome
  events: Event[]
}

type Positions = Pick<GameState, Sheep>
interface Controls {
  at: Cell
  platforms: number[]
  portals: number[]
}

export interface Board {
  start: Cell
  goal: Cell
  k: number
  floors: Set<string>
  platforms: Map<string, { group: number; platform: ControlledPlatform }>
  groups: ReadyMap['platformGroups']
  portalAt: Map<string, { pair: number; exit: Cell }>
  initiallyOpenPortals: readonly number[]
  controls: Map<string, Controls>
  ladders: Record<'up' | 'down', Map<string, Cell>>
  rows: Map<number, number[]>
  bottom: number
}

const sheep = ['gold', 'black'] as const

/** Compile once for a search or replay. The transition never edits this index. */
export function compileMap(map: ReadyMap): Board {
  const floors = new Set(map.floors.map(cellKey))
  const platforms: Board['platforms'] = new Map()
  const portalAt: Board['portalAt'] = new Map()
  const initiallyOpenPortals: number[] = []
  const controls: Board['controls'] = new Map()
  const ladders: Board['ladders'] = { up: new Map(), down: new Map() }
  const rowSets = new Map<number, Set<number>>()
  let bottom = map.start.y

  function addController(point: Cell, type: 'platforms' | 'portals', index: number) {
    const key = cellKey(point)
    // A controller needs a fixed floor to be pressed. Active floors cannot host one.
    if (!floors.has(key)) return
    const links = controls.get(key) ?? { at: point, platforms: [], portals: [] }
    links[type].push(index)
    controls.set(key, links)
  }

  map.platformGroups.forEach((group, index) => {
    for (const platform of group.platforms) {
      const support = { group: index, platform }
      platform.cells.forEach((point) => platforms.set(cellKey(point), support))
    }
    group.controllers.forEach((point) => addController(point, 'platforms', index))
  })
  map.portalPairs.forEach((pair, index) => {
    const [a, b] = pair.ends
    if (!a || !b) return
    if (pair.initiallyOpen) initiallyOpenPortals.push(index)
    portalAt.set(cellKey(a), { pair: index, exit: b })
    portalAt.set(cellKey(b), { pair: index, exit: a })
    pair.controllers.forEach((point) => addController(point, 'portals', index))
  })
  for (const { top, bottom } of map.ladders) {
    ladders.up.set(cellKey(bottom), top)
    ladders.down.set(cellKey(top), bottom)
  }
  for (const { x, y } of authoredCells(map)) {
    bottom = Math.max(bottom, y)
    const rows = rowSets.get(x) ?? new Set<number>()
    rows.add(y)
    rowSets.set(x, rows)
  }
  const rows = new Map(
    [...rowSets].map(([x, values]) => [x, [...values].sort((a, b) => a - b)] as const),
  )
  return {
    start: map.start,
    goal: map.goal,
    k: map.k,
    floors,
    platforms,
    groups: map.platformGroups,
    portalAt,
    initiallyOpenPortals,
    controls,
    ladders,
    rows,
    bottom,
  }
}

function occupancy(board: Board, positions: Positions) {
  const pressed = new Map<string, Controls>()
  const platforms = new Set<number>()
  const portals = new Set<number>()
  for (const who of sheep) {
    const point = positions[who]
    if (!point) continue
    const key = cellKey(point)
    const control = board.controls.get(key)
    if (!control) continue
    pressed.set(key, control)
    for (const group of control.platforms) platforms.add(group)
    for (const pair of control.portals) portals.add(pair)
  }
  return { pressed, platforms, portals }
}

export function boardStatus(board: Board, state: GameState) {
  const { pressed, platforms } = occupancy(board, state)
  return {
    pressed: new Set(pressed.keys()),
    platforms: board.groups.map((group, index) =>
      group.platforms.map((platform) => platformEnabled(platform, platforms.has(index))),
    ),
    portals: new Set(state.openPortals),
  }
}

function move(board: Board, point: Cell, direction: Direction): Cell | undefined {
  if (direction === 'up' || direction === 'down')
    return board.ladders[direction].get(cellKey(point))
  return { ...point, x: point.x + (direction === 'left' ? -1 : 1) }
}

function nextRow(rows: number[], y: number, fallback: number): number {
  let left = 0
  let right = rows.length
  while (left < right) {
    const mid = (left + right) >>> 1
    if (rows[mid] <= y) left = mid + 1
    else right = mid
  }
  return rows[left] ?? fallback
}

const positionKey = (point: Cell | null) => (point ? cellKey(point) : '-')
export function stateKey(state: GameState): string {
  return JSON.stringify([
    positionKey(state.gold),
    positionKey(state.black),
    state.openPortals,
    state.phase,
    state.history,
  ])
}

function settle(
  board: Board,
  draft: GameState,
  previous: Positions,
  events: Event[],
  swapped = false,
): Transition {
  const positions: Positions = { gold: draft.gold, black: draft.black }
  const open = new Set(draft.openPortals)
  const seen = new Set<string>()
  const heldTransfers = new Set<string>()
  let prior = occupancy(board, previous)
  let reopen: number | undefined

  function finish(outcome: Outcome): Transition {
    return {
      nextState: { ...draft, ...positions, openPortals: [...open].sort((a, b) => a - b) },
      outcome,
      events,
    }
  }

  function setPortal(pair: number, value: boolean) {
    if (open.has(pair) === value) return
    if (value) open.add(pair)
    else open.delete(pair)
    events.push({ type: 'portal', pair, open: value })
  }

  // Every iteration handles one simultaneous portal or gravity change.
  for (let rounds = 0; rounds < 4096; rounds++) {
    const gold = positions.gold
    const black = positions.black
    if (!gold) return finish('failed')
    if (sameCell(gold, board.goal)) {
      events.push({ type: 'goal', at: gold })
      return finish('solved')
    }
    if (swapped || sameCell(gold, black)) {
      events.push({ type: 'collision', at: gold })
      return finish('failed')
    }

    const current = occupancy(board, positions)
    for (const [key, control] of prior.pressed) {
      if (!current.pressed.has(key))
        events.push({ type: 'controller', at: control.at, pressed: false })
    }
    for (const [key, control] of current.pressed) {
      if (!prior.pressed.has(key))
        events.push({ type: 'controller', at: control.at, pressed: true })
    }
    for (const group of new Set([...prior.platforms, ...current.platforms])) {
      const pressed = current.platforms.has(group)
      if (pressed === prior.platforms.has(group)) continue
      board.groups[group].platforms.forEach((config, platform) => {
        events.push({
          type: 'platform',
          group,
          platform,
          enabled: platformEnabled(config, pressed),
        })
      })
    }
    for (const [key, control] of current.pressed) {
      if (!prior.pressed.has(key)) control.portals.forEach((pair) => setPortal(pair, true))
    }
    if (reopen !== undefined && current.portals.has(reopen)) setPortal(reopen, true)
    prior = current
    reopen = undefined

    const transfers = sheep.flatMap((who) => {
      const from = positions[who]
      if (!from) return []
      const portal = board.portalAt.get(cellKey(from))
      return portal && open.has(portal.pair) ? [{ who, from, ...portal }] : []
    })

    const single = transfers.length === 1 ? transfers[0] : undefined
    if (single && current.portals.has(single.pair)) {
      const key = `${single.pair}:${single.who}:${cellKey(single.from)}`
      if (heldTransfers.has(key)) {
        setPortal(single.pair, false)
        positions[single.who] = null
        events.push({ type: 'lost', sheep: single.who, at: single.from, cause: 'portalLoop' })
        heldTransfers.clear()
        continue
      }
      heldTransfers.add(key)
      reopen = single.pair
    } else {
      heldTransfers.clear()
    }

    const key = JSON.stringify([
      positionKey(gold),
      positionKey(black),
      [...open].sort((a, b) => a - b),
    ])
    if (seen.has(key)) return finish('unsupported_cycle')
    seen.add(key)

    if (transfers.length) {
      for (const { who, from, exit } of transfers) {
        positions[who] = exit
        events.push({ type: 'teleport', sheep: who, from, to: exit })
      }
      transfers.forEach(({ pair }) => setPortal(pair, false))
      continue
    }

    const falling = sheep.filter((who) => {
      const point = positions[who]
      if (!point) return false
      const key = cellKey(point)
      const support = board.platforms.get(key)
      return (
        !board.floors.has(key) &&
        (!support || !platformEnabled(support.platform, current.platforms.has(support.group)))
      )
    })
    if (!falling.length) return finish('stable')
    const voidRow = board.bottom + 1
    let distance = Infinity
    for (const who of falling) {
      const point = positions[who]!
      const other = who === 'gold' ? 'black' : 'gold'
      const stationary = falling.includes(other) ? null : positions[other]
      let row = nextRow(board.rows.get(point.x) ?? [], point.y, voidRow)
      if (stationary?.x === point.x && stationary.y > point.y) row = Math.min(row, stationary.y)
      distance = Math.min(distance, row - point.y)
    }
    for (const who of falling) {
      const from = positions[who]!
      const to = { ...from, y: from.y + distance }
      events.push({ type: 'fall', sheep: who, from, to })
      positions[who] = to
      if (to.y === voidRow) {
        positions[who] = null
        events.push({ type: 'lost', sheep: who, at: to, cause: 'void' })
      }
    }
  }
  return finish('unsupported_cycle')
}

export function initialState(board: Board): Transition {
  return settle(
    board,
    {
      gold: board.start,
      black: null,
      openPortals: board.initiallyOpenPortals,
      phase: 'recording',
      history: [],
      turn: 0,
    },
    { gold: null, black: null },
    [],
  )
}

export function step(board: Board, state: GameState, direction: Direction): Transition {
  const gold = state.gold && move(board, state.gold, direction)
  if (!gold) return { nextState: state, outcome: 'invalid', events: [] }

  const draft: GameState = { ...state, gold, turn: state.turn + 1 }
  const events: Event[] = [{ type: 'move', sheep: 'gold', from: state.gold!, to: gold }]
  if (state.phase === 'recording') draft.history = [...state.history, direction]
  if (state.phase === 'replaying') {
    const black = state.black && move(board, state.black, state.history[0])
    if (black) {
      draft.black = black
      events.push({ type: 'move', sheep: 'black', from: state.black!, to: black })
    }
    draft.history = state.history.slice(1)
  }
  const swapped = sameCell(state.gold, draft.black) && sameCell(state.black, gold)
  let result = settle(board, draft, state, events, swapped)

  if (
    result.outcome === 'stable' &&
    state.phase === 'recording' &&
    draft.history.length === board.k
  ) {
    const beforeSpawn = result.nextState
    events.push({ type: 'spawn', at: board.start })
    result = settle(
      board,
      { ...beforeSpawn, phase: 'replaying', black: board.start },
      beforeSpawn,
      events,
    )
  }
  const next = result.nextState
  if (next.phase === 'replaying' && (!next.black || !next.history.length)) {
    result.nextState = { ...next, phase: 'postReplay', history: [] }
  }
  return result
}
