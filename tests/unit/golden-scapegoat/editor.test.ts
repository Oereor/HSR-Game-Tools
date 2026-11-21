import { expect, it } from 'vitest'
import { editMap, type EditTool } from '../../../src/tools/golden-scapegoat/editor'
import { emptyMap, readMap, readinessIssues } from '../../../src/tools/golden-scapegoat/engine/map'

it('builds a layered map from an empty editor and round-trips it', () => {
  let map = emptyMap()
  map.platformGroups.push({
    id: 'group',
    defaultEnabled: true,
    activatedEnabled: false,
    cells: [],
    controllers: [],
  })
  map.portalPairs.push({ id: 'gate', ends: [], controllers: [] })
  const place = (tool: EditTool, x: number, y: number, group?: string) => {
    const result = editMap(map, tool, { x, y }, false, group, null)
    expect(result.issue).toBeUndefined()
    map = result.map!
  }
  place('floor', -1, 0)
  place('start', -1, 0)
  place('floor', 0, 0)
  place('platformSwitch', 0, 0, 'group')
  place('portalSwitch', 0, 0, 'gate')
  place('platform', 1, 0, 'group')
  place('portal', 1, 0, 'gate')
  place('portal', 1, 3, 'gate')
  place('goal', 1, 3)
  const { anchor } = editMap(map, 'ladder', { x: -1, y: 4 }, false, undefined, null)
  map = editMap(map, 'ladder', { x: -1, y: 0 }, false, undefined, anchor!).map!
  expect(map.ladders[0]).toEqual({ top: { x: -1, y: 0 }, bottom: { x: -1, y: 4 } })
  expect(readinessIssues(map)).toEqual([])
  expect(readMap(JSON.stringify(map))).toEqual({ map, issues: [] })

  const erased = editMap(map, 'portal', { x: 1, y: 0 }, true, 'gate', null).map!
  expect(erased.platformGroups).toBe(map.platformGroups)
  expect(readinessIssues(erased)).toMatchObject([{ code: 'pairIncomplete' }])
  expect(map.portalPairs[0].ends).toHaveLength(2)
})

it('rejects unsupported overlaps before committing the edit', () => {
  const map = emptyMap()
  map.platformGroups.push({
    id: 'group',
    defaultEnabled: true,
    activatedEnabled: false,
    cells: [{ x: 1, y: 0 }],
    controllers: [],
  })
  expect(editMap(map, 'platformSwitch', { x: 1, y: 0 }, false, 'group', null)).toMatchObject({
    issue: { code: 'platformController', cell: { x: 1, y: 0 } },
  })
  expect(map.platformGroups[0].controllers).toEqual([])
})
