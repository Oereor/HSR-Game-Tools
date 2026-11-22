import { expect, it, vi } from 'vitest'
import { animateReplayStage } from '../../../src/tools/golden-scapegoat/browser/replay-animation'
import {
  authoredCells,
  emptyMap,
  type ReadyMap,
} from '../../../src/tools/golden-scapegoat/engine/map'
import {
  boardStatus,
  compileMap,
  initialState,
  step,
  type Direction,
  type GameState,
} from '../../../src/tools/golden-scapegoat/engine/step'
import { mapBounds, replayOperation } from '../../../src/tools/golden-scapegoat/presentation'
import {
  createReplayPlayback,
  replayEnvironment,
  replayMotionStages,
} from '../../../src/tools/golden-scapegoat/replay-motion'

const at = (x: number, y = 0) => ({ x, y })
const map = (overrides: Partial<ReadyMap>): ReadyMap => ({
  ...emptyMap(),
  k: 4,
  start: at(0),
  goal: at(17, 1),
  ...overrides,
})

function pendingAnimation() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function portalReplay(keepBlack = false) {
  const authored = map({
    floors: [
      at(0),
      at(1),
      at(10),
      ...Array.from({ length: 8 }, (_, x) => at(x + 10, 1)),
      ...(keepBlack ? [at(2), at(3)] : []),
    ],
    ladders: [{ top: at(10), bottom: at(10, 1) }],
    portalPairs: [{ id: 'p', ends: [at(1), at(10)], controllers: [], initiallyOpen: true }],
  })
  const board = compileMap(authored)
  const actions: Direction[] = ['right', 'down', ...Array<Direction>(7).fill('right')]
  const frames = [initialState(board)]
  for (const action of actions) frames.push(step(board, frames.at(-1)!.nextState, action))
  return { actions, frames, view: mapBounds(authoredCells(authored)), k: authored.k }
}

it('shows recorded commands at replay boundaries, including an invalid command and early loss', () => {
  const solution = portalReplay()
  const operation = (turn: number) => replayOperation(solution, turn, solution.k)
  expect(solution.frames.at(-1)?.outcome).toBe('solved')
  expect(operation(4)).toEqual({ gold: 'right', black: undefined })
  expect(operation(5).black).toEqual({ direction: 'right', moved: true })
  expect(operation(6).black).toEqual({ direction: 'down', moved: false })
  expect(solution.frames[6].nextState.history).toEqual(['right', 'right'])
  expect(operation(7).black).toEqual({ direction: 'right', moved: true })
  expect(solution.frames[7].nextState.black).toBeNull()
  expect(operation(8).black).toBeUndefined()
  expect(operation(9).black).toBeUndefined()

  const fullReplay = portalReplay(true)
  expect(replayOperation(fullReplay, 8, fullReplay.k).black).toEqual({
    direction: 'right',
    moved: true,
  })
  expect(fullReplay.frames[8].nextState).toMatchObject({ black: at(3), phase: 'postReplay' })
  expect(replayOperation(fullReplay, 9, fullReplay.k).black).toBeUndefined()
})

it('uses recorded ladder, spawn and void events, with a snapshot fallback for unprojectable frames', () => {
  const { frames, view } = portalReplay()
  const stages = (turn: number) =>
    replayMotionStages(frames[turn - 1].nextState, frames[turn], view)
  expect(stages(2)).toEqual([{ type: 'move', positions: { gold: at(10, 1), black: null } }])
  expect(stages(4)?.map(({ type }) => type)).toEqual(['move', 'spawn'])
  expect(stages(7)?.map(({ type }) => type)).toEqual(['move', 'fall', 'lost'])
  expect(stages(7)?.at(-1)).toEqual({ type: 'lost', positions: { gold: at(15, 1), black: null } })
  expect(replayMotionStages(frames[0].nextState, frames[1], { ...view, width: 2 })).toBeUndefined()
  const mismatched = { ...frames[2], nextState: { ...frames[2].nextState, gold: at(11, 1) } }
  expect(replayMotionStages(frames[1].nextState, mismatched, view)).toBeUndefined()
})

it('groups both active moves and a two-ended portal exchange into parallel stages', () => {
  const authored = map({
    floors: [at(0), at(1), at(4), at(5)],
    portalPairs: [{ id: 'p', ends: [at(1), at(5)], controllers: [], initiallyOpen: true }],
  })
  const board = compileMap(authored)
  const before: GameState = {
    ...initialState(board).nextState,
    black: at(4),
    history: ['right'],
    phase: 'replaying',
    turn: 4,
  }
  const after = step(board, before, 'right')
  expect(replayMotionStages(before, after, mapBounds(authoredCells(authored)))).toEqual([
    { type: 'move', positions: { gold: at(1), black: at(5) } },
    { type: 'teleport', positions: { gold: at(5), black: at(1) } },
    { type: 'environment', events: [{ type: 'portal', pair: 0, open: false }] },
  ])
})

it('applies the recorded platform change before a passive black sheep falls', () => {
  const authored = map({
    floors: [at(0), at(1), at(3, 2)],
    platformGroups: [
      {
        id: 'bridge',
        controllers: [at(0)],
        platforms: [{ id: 'ledge', cells: [at(3)], enabledWhenPressed: true }],
      },
    ],
  })
  const board = compileMap(authored)
  const before: GameState = {
    ...initialState(board).nextState,
    black: at(3),
    phase: 'postReplay',
    turn: 8,
  }
  const transition = step(board, before, 'right')
  const stages = replayMotionStages(before, transition, mapBounds(authoredCells(authored)))
  expect(stages?.map(({ type }) => type)).toEqual(['move', 'environment', 'fall'])
  const change = stages?.[1]
  if (change?.type !== 'environment') throw new Error('Expected an environment stage')
  expect(replayEnvironment(boardStatus(board, before), change.events)).toEqual(
    boardStatus(board, transition.nextState),
  )
  expect(stages?.at(-1)).toEqual({
    type: 'fall',
    positions: { gold: at(1), black: at(3, 2) },
  })
})

it('fades both portal entrants together without interpolating between endpoints', async () => {
  const fadeOut = pendingAnimation()
  const gold = { style: {}, animate: vi.fn(() => ({ finished: fadeOut.promise, cancel: vi.fn() })) }
  const black = {
    style: {},
    animate: vi.fn(() => ({ finished: fadeOut.promise, cancel: vi.fn() })),
  }
  const running = animateReplayStage(
    { gold, black } as unknown as Record<'gold' | 'black', HTMLElement>,
    { gold: at(1), black: at(5) },
    { type: 'teleport', positions: { gold: at(5), black: at(1) } },
    ({ x }) => ({ transform: `translateX(${x}px)`, opacity: '1' }),
    new AbortController().signal,
  )
  expect(gold.animate).toHaveBeenCalledTimes(1)
  expect(black.animate).toHaveBeenCalledTimes(1)
  fadeOut.resolve()
  await running
  for (const [marker, entry, exit] of [
    [gold, 1, 5],
    [black, 5, 1],
  ] as const) {
    expect(marker.animate).toHaveBeenNthCalledWith(
      1,
      [
        { transform: `translateX(${entry}px)`, opacity: '1' },
        { transform: `translateX(${entry}px)`, opacity: '0' },
      ],
      expect.anything(),
    )
    expect(marker.animate).toHaveBeenNthCalledWith(
      2,
      [
        { transform: `translateX(${exit}px)`, opacity: '0' },
        { transform: `translateX(${exit}px)`, opacity: '1' },
      ],
      expect.anything(),
    )
  }
})

it('cancels the active playback on rapid navigation and ignores its stale completion', async () => {
  const { frames, view } = portalReplay()
  const stages = replayMotionStages(frames[0].nextState, frames[1], view)!
  const playback = createReplayPlayback()
  const pending = pendingAnimation()
  const cancelled = vi.fn()
  const render = vi.fn(async (_, signal: AbortSignal) => {
    signal.addEventListener('abort', cancelled, { once: true })
    await pending.promise
  })
  const finish = vi.fn()
  const old = playback.play(stages, render, finish)
  expect(playback.cancel()).toBe(true)
  expect(cancelled).toHaveBeenCalledOnce()
  const newest = vi.fn(async () => {})
  const finishNewest = vi.fn()
  await playback.play(stages, newest, finishNewest)
  pending.resolve()
  await old
  expect(render).toHaveBeenCalledOnce()
  expect(finish).not.toHaveBeenCalled()
  expect(newest).toHaveBeenCalledTimes(stages.length)
  expect(finishNewest).toHaveBeenCalledOnce()
})
