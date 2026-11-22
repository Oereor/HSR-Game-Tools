import { expect, it } from 'vitest'
import {
  editMap,
  ensureGroup,
  parseRecordSteps,
  type Brush,
} from '../../../src/tools/golden-scapegoat/editor'
import {
  emptyMap,
  prepareMap,
  readMap,
  readinessIssues,
  type PuzzleMap,
} from '../../../src/tools/golden-scapegoat/engine/map'
import { compileMap } from '../../../src/tools/golden-scapegoat/engine/step'

const at = (x: number, y = 0) => ({ x, y })

it('builds a layered map with both polarities in the same group and round-trips it', () => {
  let map: PuzzleMap = {
    ...ensureGroup(ensureGroup(emptyMap(), 'platform', 'group'), 'portal', 'gate'),
    k: 3,
  }
  const place = (tool: Brush, x: number, y: number) => {
    const result = editMap(map, tool, at(x, y))
    expect(result.issue).toBeUndefined()
    map = result.map!
  }
  place({ tool: 'floor' }, -1, 0)
  place({ tool: 'start' }, -1, 0)
  place({ tool: 'floor' }, 0, 0)
  place({ tool: 'platformSwitch', groupId: 'group' }, 0, 0)
  place({ tool: 'portalSwitch', groupId: 'gate' }, 0, 0)
  place({ tool: 'platformReleased', groupId: 'group' }, 1, 0)
  place({ tool: 'platformPressed', groupId: 'group' }, 2, 0)
  place({ tool: 'portal', groupId: 'gate' }, 1, 0)
  place({ tool: 'portal', groupId: 'gate' }, 1, 3)
  place({ tool: 'goal' }, 1, 3)
  place({ tool: 'floor' }, 1, 3)
  const ladder = { tool: 'ladder' } as const
  const { anchor } = editMap(map, ladder, at(-1, 4))
  map = editMap(map, ladder, at(-1), anchor!).map!
  expect(readinessIssues(map)).toMatchObject([{ code: 'ladderBottomSupport', cell: at(-1, 4) }])
  place({ tool: 'floor' }, -1, 4)
  expect(map.ladders[0]).toEqual({ top: at(-1), bottom: at(-1, 4) })
  expect(
    map.platformGroups[0].platforms.map(({ enabledWhenPressed }) => enabledWhenPressed),
  ).toEqual([false, true])
  expect(readinessIssues(map)).toEqual([])
  expect(compileMap(prepareMap(map).map!).initiallyOpenPortals).toEqual([0])
  expect(readMap(JSON.stringify(map))).toEqual({ map, issues: [] })
  expect(editMap(map, { tool: 'portal', groupId: 'gate' }, at(3))).toMatchObject({
    issue: { code: 'portalEnds' },
  })

  const erased = editMap(map, { tool: 'erase' }, at(1)).map!
  expect(erased.portalPairs[0]).toMatchObject({ initiallyOpen: true, ends: [at(1, 3)] })
  expect(erased.platformGroups[0].platforms.map(({ cells }) => cells)).toEqual([[at(2)]])
  expect(readinessIssues(erased)).toMatchObject([{ code: 'pairIncomplete' }])
  expect(map.portalPairs[0].ends).toHaveLength(2)
})

it('repaints a whole multi-cell platform in place and erases only the selected platform cell', () => {
  const map = emptyMap()
  const cells = [at(1), at(2)]
  map.platformGroups.push({
    id: 'group',
    controllers: [],
    platforms: [{ id: 'ledge', cells, enabledWhenPressed: false }],
  })
  expect(editMap(map, { tool: 'platformSwitch', groupId: 'group' }, at(1))).toMatchObject({
    issue: { code: 'platformController', cell: at(1) },
  })
  const repainted = editMap(map, { tool: 'platformPressed', groupId: 'group' }, at(2)).map!
  expect(repainted.platformGroups[0].platforms).toEqual([
    { id: 'ledge', cells, enabledWhenPressed: true },
  ])
  expect(map.platformGroups[0].platforms[0].enabledWhenPressed).toBe(false)
  const erased = editMap(repainted, { tool: 'erase' }, at(2)).map!
  expect(erased.platformGroups[0].platforms).toEqual([
    { id: 'ledge', cells: [at(1)], enabledWhenPressed: true },
  ])
})

it('erases every layer at a cell, including all attached or intersecting ladders', () => {
  const target = at(0)
  const map = {
    ...emptyMap(),
    start: target,
    goal: target,
    floors: [target, at(1)],
    ladders: [
      { top: at(0, -3), bottom: target },
      { top: target, bottom: at(0, 2) },
      { top: at(0, -1), bottom: at(0, 1) },
      { top: at(1), bottom: at(1, 1) },
    ],
    platformGroups: [{ id: 'group', controllers: [target], platforms: [] }],
    portalPairs: [
      { id: 'gate', initiallyOpen: false, controllers: [target], ends: [at(3), at(4)] },
    ],
  }
  const erased = editMap(map, { tool: 'erase' }, target).map!
  expect(erased).toEqual({
    ...map,
    start: null,
    goal: null,
    floors: [at(1)],
    ladders: [map.ladders[3]],
    platformGroups: [{ ...map.platformGroups[0], controllers: [] }],
    portalPairs: [{ ...map.portalPairs[0], controllers: [] }],
  })
  expect(editMap(erased, { tool: 'erase' }, target)).toEqual({})
})

it('creates an open portal without blocking search until a cell is authored', () => {
  const base = { ...emptyMap(), k: 1, start: at(0), goal: at(1) }
  const map = ensureGroup(base, 'portal', 'gate')
  expect(map.portalPairs).toEqual([{ id: 'gate', initiallyOpen: true, controllers: [], ends: [] }])
  expect(readinessIssues(map)).toEqual([])
  expect(compileMap(prepareMap(map).map!).initiallyOpenPortals).toEqual([])
  const closed = { ...map, portalPairs: [{ ...map.portalPairs[0], initiallyOpen: false }] }
  expect(ensureGroup(closed, 'portal', 'gate')).toBe(closed)
  const edited = editMap(closed, { tool: 'portalSwitch', groupId: 'gate' }, at(0)).map!
  expect(edited.portalPairs[0].initiallyOpen).toBe(false)
  expect(readinessIssues(edited).map(({ code }) => code)).toEqual(['pairIncomplete'])
})

it('accepts switches for other groups at portal endpoints and rejects the pair’s own switch in either order', () => {
  let map = ensureGroup(
    ensureGroup(ensureGroup(emptyMap(), 'portal', 'p1'), 'portal', 'p2'),
    'platform',
    'a',
  )
  const cell = at(2)
  const endpoint = { tool: 'portal', groupId: 'p1' } as const
  const ownSwitch = { tool: 'portalSwitch', groupId: 'p1' } as const
  const switchFirst = editMap(map, ownSwitch, cell).map!
  expect(editMap(switchFirst, endpoint, cell)).toMatchObject({
    issue: { code: 'portalController', cell },
  })
  map = editMap(map, endpoint, cell).map!
  expect(editMap(map, ownSwitch, cell)).toMatchObject({ issue: { code: 'portalController', cell } })
  map = editMap(map, { tool: 'portalSwitch', groupId: 'p2' }, cell).map!
  map = editMap(map, { tool: 'platformSwitch', groupId: 'a' }, cell).map!
  expect(readMap(JSON.stringify(map))).toEqual({ map, issues: [] })
  expect(editMap(map, { tool: 'platformPressed', groupId: 'a' }, cell)).toMatchObject({
    issue: { code: 'platformController', cell },
  })
  expect(readinessIssues(map)).toContainEqual(
    expect.objectContaining({ code: 'portalSupport', cell }),
  )
  map = editMap(map, { tool: 'floor' }, cell).map!
  expect(readinessIssues(map).map(({ code }) => code)).not.toContain('portalSupport')
})

it('parses live record-step text and clears the draft when the field is emptied', () => {
  expect(parseRecordSteps(' 08 ')).toBe(8)
  const draft = { ...emptyMap(), k: parseRecordSteps('8') }
  expect(readMap(JSON.stringify(draft)).map?.k).toBe(8)
  expect(readMap(JSON.stringify({ ...draft, k: parseRecordSteps('') })).map?.k).toBeNull()
  for (const text of [' ', '0', '-1', '1.5', '1e2', '9007199254740992']) {
    expect(parseRecordSteps(text)).toBeNull()
  }
})
