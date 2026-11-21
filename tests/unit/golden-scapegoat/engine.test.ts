import { describe, expect, it } from 'vitest'
import { demos } from '../../../src/tools/golden-scapegoat/demos'
import { emptyMap, type ReadyMap } from '../../../src/tools/golden-scapegoat/engine/map'
import { solve } from '../../../src/tools/golden-scapegoat/engine/solve'
import {
  boardStatus,
  compileMap,
  initialState,
  stateKey,
  step,
  type Direction,
  type GameState,
} from '../../../src/tools/golden-scapegoat/engine/step'

const at = (x: number, y = 0) => ({ x, y })
const map = (config: Partial<ReadyMap> = {}): ReadyMap => ({
  ...emptyMap(),
  k: 3,
  start: at(0),
  goal: at(99),
  floors: [at(0)],
  ...config,
})
const state = (config: Partial<GameState> = {}): GameState => ({
  gold: at(0),
  black: null,
  openPortals: [],
  phase: 'recording',
  history: [],
  turn: 0,
  ...config,
})
const replay = (gold: GameState['gold'], black: GameState['black'], action: Direction) =>
  state({ gold, black, history: [action], phase: 'replaying', turn: 3 })

describe('turns, gravity and replay', () => {
  it('rejects invalid gold input without advancing black, but counts a ladder as one move', () => {
    const board = compileMap(
      map({
        floors: [at(0), at(0, 6), at(3), at(4)],
        ladders: [{ top: at(0), bottom: at(0, 6) }],
      }),
    )
    const before = replay(at(0), at(3), 'right')
    expect(step(board, before, 'up')).toEqual({ nextState: before, outcome: 'invalid', events: [] })
    expect(step(board, before, 'up').nextState).toBe(before)
    const result = step(board, before, 'down')
    expect(result.nextState).toMatchObject({
      gold: at(0, 6),
      black: at(4),
      turn: 4,
      phase: 'postReplay',
      history: [],
    })
  })

  it('falls immediately, detects the goal during descent, and permits off-grid moves', () => {
    const board = compileMap(map({ floors: [at(0), at(1, 5)], goal: at(2, 2) }))
    expect(step(board, state(), 'right')).toMatchObject({ nextState: { gold: at(1, 5), turn: 1 } })
    expect(step(board, state(), 'left')).toMatchObject({
      outcome: 'failed',
      nextState: { gold: null, turn: 1 },
    })
    const withGoal = compileMap(map({ floors: [at(0), at(1, 5)], goal: at(1, 4) }))
    expect(step(withGoal, state(), 'right')).toMatchObject({
      outcome: 'solved',
      nextState: { gold: at(1, 4), turn: 1 },
    })
  })

  it('spawns at K after settling, and consumes exactly one instruction including an invalid replay move', () => {
    const board = compileMap(
      map({
        k: 2,
        floors: [at(0), at(1), at(1, 2), at(2, 2), at(3, 2)],
        ladders: [{ top: at(1), bottom: at(1, 2) }],
        portalPairs: [
          { id: 'p', initiallyOpen: false, ends: [at(7), at(8)], controllers: [at(0)] },
        ],
      }),
    )
    const first = step(board, initialState(board).nextState, 'right')
    expect(first.nextState).toMatchObject({ black: null, turn: 1, history: ['right'] })
    const second = step(board, first.nextState, 'down')
    expect(second.nextState).toMatchObject({
      black: at(0),
      turn: 2,
      phase: 'replaying',
      history: ['right', 'down'],
    })
    expect(second.events.map((event) => event.type)).toEqual(['move', 'spawn'])
    const third = step(board, second.nextState, 'right')
    expect(third.nextState).toMatchObject({ black: at(1), turn: 3, history: ['down'] })
    const fourth = step(board, third.nextState, 'right')
    expect(fourth.nextState).toMatchObject({
      black: at(1, 2),
      turn: 4,
      phase: 'postReplay',
      history: [],
    })
    const skipped = step(board, replay(at(1, 2), at(0), 'down'), 'right')
    expect(skipped.nextState).toMatchObject({
      black: at(0),
      turn: 4,
      phase: 'postReplay',
      history: [],
    })
  })

  it('settles spawn collisions and switch effects before taking another turn', () => {
    const loop = compileMap(map({ k: 2, floors: [at(0), at(1)] }))
    const first = step(loop, initialState(loop).nextState, 'right')
    expect(step(loop, first.nextState, 'left')).toMatchObject({ outcome: 'failed' })

    const board = compileMap(
      map({
        k: 1,
        floors: [at(0), at(1), at(3)],
        portalPairs: [
          { id: 'p', initiallyOpen: false, ends: [at(1), at(3)], controllers: [at(0)] },
        ],
      }),
    )
    const result = step(board, initialState(board).nextState, 'right')
    expect(result.nextState).toMatchObject({ gold: null, black: at(0), phase: 'replaying' })
    expect(result.events).toContainEqual({
      type: 'lost',
      sheep: 'gold',
      at: at(3),
      cause: 'portalLoop',
    })
    expect(result.outcome).toBe('failed')
  })

  it('drops black from future replay when it falls into the void, allowing gold to win later', () => {
    const board = compileMap(map({ floors: [at(0), at(1), at(2), at(6)], goal: at(2) }))
    const before = state({ black: at(6), phase: 'replaying', history: ['right', 'left'], turn: 3 })
    const result = step(board, before, 'right')
    expect(result.nextState).toMatchObject({
      gold: at(1),
      black: null,
      phase: 'postReplay',
      history: [],
    })
    expect(result.outcome).toBe('stable')
    expect(step(board, result.nextState, 'right').outcome).toBe('solved')
  })
})

describe('activity platforms', () => {
  const config = (defaultEnabled = false, activatedEnabled = true) => ({
    id: 'a',
    defaultEnabled,
    activatedEnabled,
    cells: [at(6)],
    controllers: [at(1), at(2)],
  })
  const scenario = (group = config()) =>
    compileMap(
      map({
        floors: [at(0), at(1), at(2), at(3), at(5), at(6, 4), at(7)],
        platformGroups: [group],
      }),
    )

  it('supports gold immediately when black steps on the controller in the same turn', () => {
    const board = scenario()
    const result = step(board, replay(at(5), at(0), 'right'), 'right')
    expect(result.nextState).toMatchObject({ gold: at(6), black: at(1) })
    expect(result.events).not.toContainEqual(expect.objectContaining({ type: 'fall' }))
  })

  it('drops gold when black leaves the last controller during the same turn', () => {
    const result = step(scenario(), replay(at(5), at(1), 'left'), 'right')
    expect(result.nextState).toMatchObject({ gold: at(6, 4), black: at(0) })
  })

  it('leaves a sheep that already stepped off the disappearing platform at its new position', () => {
    const result = step(scenario(), replay(at(6), at(1), 'left'), 'right')
    expect(result.nextState).toMatchObject({ gold: at(7), black: at(0) })
    expect(result.events).not.toContainEqual(expect.objectContaining({ type: 'fall' }))
  })

  it('applies OR and inverse configuration', () => {
    const board = scenario(config(true, false))
    expect(boardStatus(board, state()).platforms).toEqual([true])
    expect(boardStatus(board, state({ gold: at(1) })).platforms).toEqual([false])
    expect(boardStatus(board, state({ black: at(2) })).platforms).toEqual([false])
    const result = step(board, replay(at(1), at(2), 'right'), 'left')
    expect(boardStatus(board, result.nextState).platforms).toEqual([true])
    expect(boardStatus(board, state({ gold: at(1), black: at(2) })).platforms).toEqual([false])
  })

  it('finishes a cascade in one turn, including passive black falling after replay', () => {
    const chain = compileMap(
      map({
        floors: [at(0), at(3, 2), at(1, 4)],
        platformGroups: [
          {
            id: 'black',
            defaultEnabled: false,
            activatedEnabled: true,
            cells: [at(3)],
            controllers: [at(0)],
          },
          {
            id: 'gold',
            defaultEnabled: true,
            activatedEnabled: false,
            cells: [at(1)],
            controllers: [at(3, 2)],
          },
        ],
      }),
    )
    const cascade = step(chain, state({ black: at(3), phase: 'postReplay', turn: 8 }), 'right')
    expect(cascade.nextState).toMatchObject({
      turn: 9,
      gold: at(1, 4),
      black: at(3, 2),
      history: [],
    })
    expect(cascade.events.map((event) => event.type)).toEqual([
      'move',
      'platform',
      'fall',
      'platform',
      'fall',
    ])
  })
})

describe('contacts and portals', () => {
  it('opens the configured pairs before settling frame zero', () => {
    const config = map({
      floors: [at(0), at(1), at(2)],
      portalPairs: [
        { id: 'first', initiallyOpen: true, ends: [at(1), at(2)], controllers: [] },
        { id: 'closed', initiallyOpen: false, ends: [at(3), at(4)], controllers: [] },
        { id: 'last', initiallyOpen: true, ends: [at(5), at(6)], controllers: [] },
      ],
    })
    const initial = initialState(compileMap(config))
    expect(initial.nextState.openPortals).toEqual([0, 2])

    const board = compileMap({ ...config, start: at(1) })
    const frame = initialState(board)
    expect(frame).toMatchObject({ nextState: { gold: at(2), turn: 0 }, outcome: 'stable' })
    expect(frame.events).toContainEqual({ type: 'portal', pair: 0, open: false })
    expect(boardStatus(board, frame.nextState).portals).toEqual(new Set([2]))
  })

  it('checks same-cell, horizontal swap, ladder swap and contact during a fall', () => {
    const board = compileMap(
      map({
        floors: [at(0), at(1), at(2), at(1, 5), at(5)],
        ladders: [{ top: at(1), bottom: at(1, 5) }],
      }),
    )
    expect(step(board, replay(at(0), at(2), 'left'), 'right').outcome).toBe('failed')
    expect(step(board, replay(at(0), at(1), 'left'), 'right').outcome).toBe('failed')
    expect(step(board, replay(at(1), at(1, 5), 'up'), 'down').outcome).toBe('failed')
    const fallBoard = compileMap(map({ floors: [at(0), at(1, 5), at(1, 10)] }))
    expect(step(fallBoard, state({ black: at(1, 5), phase: 'postReplay' }), 'right').outcome).toBe(
      'failed',
    )
  })

  it('permits paired simultaneous exchange and closes the door', () => {
    const board = compileMap(
      map({
        floors: [at(0), at(1), at(4), at(5)],
        portalPairs: [{ id: 'p', initiallyOpen: false, ends: [at(1), at(5)], controllers: [] }],
      }),
    )
    const before = { ...replay(at(0), at(4), 'right'), openPortals: [0] }
    expect(step(board, before, 'right')).toMatchObject({
      outcome: 'stable',
      nextState: { gold: at(5), black: at(1), openPortals: [] },
    })
  })

  it('opens on a new press when black already occupies a closed endpoint, then removes looping black', () => {
    const board = compileMap(
      map({
        floors: [at(0), at(1), at(4), at(6)],
        portalPairs: [
          { id: 'p', initiallyOpen: false, ends: [at(4), at(6)], controllers: [at(1)] },
        ],
      }),
    )
    const result = step(board, state({ black: at(4), phase: 'postReplay' }), 'right')
    expect(result).toMatchObject({
      outcome: 'stable',
      nextState: { gold: at(1), black: null, openPortals: [] },
    })
    expect(result.events).toContainEqual({
      type: 'lost',
      sheep: 'black',
      cause: 'portalLoop',
      at: at(4),
    })
  })

  it('evaluates goal on arrival before a return teleport or simultaneous collision', () => {
    const board = compileMap(
      map({
        floors: [at(0), at(1), at(4), at(6)],
        goal: at(6),
        portalPairs: [
          { id: 'p', initiallyOpen: false, ends: [at(1), at(6)], controllers: [at(4)] },
        ],
      }),
    )
    const before = state({ black: at(4), phase: 'postReplay', openPortals: [0] })
    expect(step(board, before, 'right')).toMatchObject({
      outcome: 'solved',
      nextState: { gold: at(6) },
    })
    const tie = compileMap(map({ floors: [at(0), at(1)], goal: at(1) }))
    expect(step(tie, state({ black: at(1), phase: 'postReplay' }), 'right').outcome).toBe('solved')
  })
})

describe('BFS and replay', () => {
  it.each([
    [demos.platform, ['right', 'right', 'right']],
    [demos.portal, ['up', 'right', 'right']],
  ] as const)('finds a shortest solution and replays it to the goal', (demo, actions) => {
    const result = solve(compileMap(demo))
    expect(result).toMatchObject({ status: 'solved', actions })
    if (result.status !== 'solved') return
    expect(result.frames).toHaveLength(actions.length + 1)
    expect(result.frames.at(-1)).toMatchObject({
      nextState: { gold: demo.goal, turn: actions.length },
      outcome: 'solved',
    })
  })

  it('distinguishes no solution, state limit, time limit and incomplete environmental settlement', () => {
    expect(solve(compileMap(map()))).toMatchObject({ status: 'unsolvable' })
    expect(solve(compileMap(demos.portal), { states: 1, milliseconds: 5000 })).toMatchObject({
      status: 'resource_limit',
      reason: 'states',
    })
    let tick = 0
    expect(
      solve(compileMap(demos.portal), { states: 1000, milliseconds: 1 }, () => tick++),
    ).toMatchObject({
      status: 'resource_limit',
      reason: 'time',
    })
    const cells = Array.from({ length: 4100 }, (_, i) => at(-1, i))
    const platformGroups = [
      { id: 'deep', defaultEnabled: false, activatedEnabled: true, cells, controllers: [] },
    ]
    expect(solve(compileMap(map({ platformGroups })))).toMatchObject({
      status: 'unsupported_cycle',
    })
    expect(solve(compileMap(map({ platformGroups, goal: at(1) })))).toMatchObject({
      status: 'solved',
      actions: ['right'],
    })
  })

  it('keeps relevant history, portal flags and phase in the key while ignoring the display turn', () => {
    const start = state()
    expect(stateKey(state({ turn: 20 }))).toBe(stateKey(start))
    expect(stateKey(state({ history: ['down'] }))).not.toBe(stateKey(start))
    expect(stateKey(state({ openPortals: [0] }))).not.toBe(stateKey(start))
    expect(stateKey(state({ phase: 'postReplay' }))).not.toBe(stateKey(start))
  })
})

describe('MVP event ordering', () => {
  it('falls past an unsupported controller but teleports from an open unsupported endpoint', () => {
    const board = compileMap(
      map({
        floors: [at(0), at(1, 3), at(4)],
        portalPairs: [
          { id: 'p', initiallyOpen: false, ends: [at(1, 2), at(4)], controllers: [at(1, 1)] },
        ],
      }),
    )
    const closed = step(board, state(), 'right')
    expect(closed.nextState).toMatchObject({ gold: at(1, 3), openPortals: [] })
    expect(closed.events.some(({ type }) => type === 'portal')).toBe(false)
    const opened = step(board, state({ openPortals: [0] }), 'right')
    expect(opened.nextState).toMatchObject({ gold: at(4), openPortals: [] })
    expect(opened.events).toContainEqual({
      type: 'teleport',
      sheep: 'gold',
      from: at(1, 2),
      to: at(4),
    })
  })

  it('settles unsupported starts and wins at G without requiring support or spawning on the winning turn', () => {
    const fallingStart = compileMap(map({ floors: [], goal: at(0, 1) }))
    expect(solve(fallingStart)).toMatchObject({ status: 'solved', actions: [] })
    const board = compileMap(map({ k: 1, goal: at(1) }))
    const move = step(board, initialState(board).nextState, 'right')
    expect(move).toMatchObject({
      outcome: 'solved',
      nextState: { black: null, gold: at(1), turn: 1 },
    })
  })

  it('treats ladder interiors as transit between the two endpoints', () => {
    const board = compileMap(
      map({
        goal: at(0, 2),
        floors: [at(0), at(0, 4)],
        ladders: [{ top: at(0), bottom: at(0, 4) }],
      }),
    )
    expect(step(board, initialState(board).nextState, 'down')).toMatchObject({
      outcome: 'stable',
      nextState: { gold: at(0, 4), turn: 1 },
    })
  })
})
