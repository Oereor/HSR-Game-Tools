import { expect, it } from 'vitest'
import {
  actionSequence,
  groupChoices,
  locateEditWindow,
  mapBounds,
  operationPhase,
  panEditWindow,
  replayWindow,
  visibleLadderCells,
} from '../../../src/tools/golden-scapegoat/presentation'

it('pans by half the visible window, keeping the orthogonal axis and dimensions', () => {
  const view = { x: 3, y: -2, width: 11, height: 6 }
  expect(panEditWindow(view, 'left')).toEqual({ x: -2, y: -2 })
  expect(panEditWindow(view, 'right')).toEqual({ x: 8, y: -2 })
  expect(panEditWindow(view, 'up')).toEqual({ x: 3, y: -5 })
  expect(panEditWindow(view, 'down')).toEqual({ x: 3, y: 1 })
  expect(view).toEqual({ x: 3, y: -2, width: 11, height: 6 })
})

it('clamps the whole editor window and locates maps around their bounds or start', () => {
  const edge = { x: -999_998, y: 999_989, width: 12, height: 8 }
  expect(panEditWindow(edge, 'left')).toEqual({ x: -1_000_000, y: 999_989 })
  expect(panEditWindow(edge, 'down')).toEqual({ x: -999_998, y: 999_993 })
  const small = mapBounds([
    { x: -7, y: 3 },
    { x: -2, y: 4 },
  ])
  expect(locateEditWindow(edge, small, { x: -2, y: 4 })).toEqual({ x: -7, y: 3 })
  const large = mapBounds([
    { x: -71, y: 3 },
    { x: 24, y: 4 },
  ])
  expect(locateEditWindow(edge, large, { x: 19, y: 4 })).toEqual({ x: 13, y: 3 })
  expect(locateEditWindow(edge, large, null)).toEqual({ x: -71, y: 3 })
})

it('projects ladder rows after the upper endpoint through the lower endpoint', () => {
  const ladders = [
    { top: { x: -1, y: -2 }, bottom: { x: -1, y: 1 } },
    { top: { x: 3, y: -1_000_000 }, bottom: { x: 3, y: 1_000_000 } },
    { top: { x: 4, y: 0 }, bottom: { x: 4, y: 2 } },
  ]
  const grid = { x: -1, y: -2, width: 5, height: 5 }
  expect(visibleLadderCells(ladders, grid)).toEqual(
    new Set(['-1,-1', '-1,0', '-1,1', '3,-2', '3,-1', '3,0', '3,1', '3,2']),
  )
})

it('uses the actual bounds for small replays and keeps both sheep visible when they fit', () => {
  const small = mapBounds([
    { x: -3, y: 1 },
    { x: 0, y: 1 },
  ])
  expect(replayWindow(small, { gold: { x: 0, y: 1 }, black: null })).toEqual({
    x: -3,
    y: 1,
    width: 4,
    height: 1,
  })
  const wide = mapBounds([
    { x: -100, y: 1 },
    { x: 100, y: 1 },
  ])
  expect(replayWindow(wide, { gold: { x: -35, y: 1 }, black: { x: -5, y: 1 } })).toEqual({
    x: -36,
    y: 1,
    width: 32,
    height: 1,
  })
  expect(replayWindow(wide, { gold: { x: 98, y: 1 }, black: { x: -80, y: 1 } })).toEqual({
    x: 69,
    y: 1,
    width: 32,
    height: 1,
  })
})

it('keeps the second visual slot stable regardless of the imported group order', () => {
  const groups = [{ id: 'bridge' }, { id: 'extra' }, { id: 'platform-2' }]
  const { slots, extras, byIndex } = groupChoices('platform', groups)
  expect(slots.map(({ id }) => id)).toEqual(['bridge', 'platform-2'])
  expect(extras.map(({ id }) => id)).toEqual(['extra'])
  expect(byIndex.map(({ id }) => id)).toEqual(groups.map(({ id }) => id))
  expect(groupChoices('platform', [groups[2]]).slots.map(({ index }) => index)).toEqual([-1, 0])
})

it('formats whole sequences and assigns operation boundaries by the step being executed', () => {
  const moves = ['left', 'right', 'up', 'down'] as const
  expect(actionSequence([...moves], 'wasd')).toBe('ADWS')
  expect(actionSequence([...moves], 'arrow')).toBe('← → ↑ ↓')
  expect([1, 5, 6, 10, 11].map((step) => operationPhase(step, 5))).toEqual([
    'recording',
    'recording',
    'replaying',
    'replaying',
    'postReplay',
  ])
})
