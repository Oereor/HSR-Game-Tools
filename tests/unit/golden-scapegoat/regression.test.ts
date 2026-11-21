import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readMap, readinessIssues } from '../../../src/tools/golden-scapegoat/engine/map'
import { solve } from '../../../src/tools/golden-scapegoat/engine/solve'
import {
  compileMap,
  initialState,
  step,
  type Direction,
} from '../../../src/tools/golden-scapegoat/engine/step'

function regressionBoard() {
  const source = new URL(
    '../../fixtures/golden-scapegoat/sample-map_regression-v2.json',
    import.meta.url,
  )
  const { map, issues } = readMap(readFileSync(source, 'utf8'))
  expect(issues).toEqual([])
  if (!map?.start || !map.goal) throw new Error('The regression map needs a start and goal')
  expect(readinessIssues(map)).toEqual([])
  expect(map.k).toBe(5)
  return compileMap({ ...map, start: map.start, goal: map.goal })
}

it('follows the known game solution through the portal, spawn, ladder and platforms', () => {
  const board = regressionBoard()
  const wasd: Record<string, Direction> = { A: 'left', D: 'right', W: 'up' }
  const sequence = 'AAAAADWDDDD'
  const checkpoints: Partial<Record<number, object>> = {
    1: { nextState: { gold: { x: 6, y: 3 }, openPortals: [] } },
    5: {
      nextState: { black: { x: 2, y: 1 } },
      events: expect.arrayContaining([{ type: 'spawn', at: { x: 2, y: 1 } }]),
    },
    6: {
      nextState: { black: { x: 6, y: 3 }, openPortals: [] },
      events: expect.arrayContaining([
        { type: 'teleport', sheep: 'black', from: { x: 1, y: 1 }, to: { x: 6, y: 3 } },
      ]),
    },
    7: { nextState: { gold: { x: 3, y: 1 } } },
    8: { nextState: { gold: { x: 4, y: 1 } } },
    10: { nextState: { gold: { x: 6, y: 1 } } },
    11: { nextState: { gold: { x: 7, y: 1 } } },
  }

  let frame = initialState(board)
  expect(frame, 'frame 0').toMatchObject({
    outcome: 'stable',
    nextState: { gold: { x: 2, y: 1 }, black: null, openPortals: [0], turn: 0 },
  })
  for (const [index, input] of Array.from(sequence).entries()) {
    const turn = index + 1
    frame = step(board, frame.nextState, wasd[input])
    expect(frame, `step ${turn} (${input})`).toMatchObject({
      outcome: turn === sequence.length ? 'solved' : 'stable',
      nextState: { turn },
    })
    const checkpoint = checkpoints[turn]
    if (checkpoint) expect(frame, `step ${turn} (${input})`).toMatchObject(checkpoint)
  }
})

it('solves the real map and reproduces every returned replay frame with step', () => {
  const board = regressionBoard()
  const result = solve(board)
  expect(result).toMatchObject({ status: 'solved' })
  if (result.status !== 'solved') return

  expect(result.frames).toHaveLength(result.actions.length + 1)
  let frame = initialState(board)
  expect(result.frames[0]).toEqual(frame)
  for (const [index, action] of result.actions.entries()) {
    frame = step(board, frame.nextState, action)
    expect(result.frames[index + 1], `replay step ${index + 1} (${action})`).toEqual(frame)
  }
  expect(frame).toMatchObject({ nextState: { gold: { x: 7, y: 1 } }, outcome: 'solved' })
})
