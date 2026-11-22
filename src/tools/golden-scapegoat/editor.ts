import { layoutIssues, sameCell, type Cell, type MapIssue, type PuzzleMap } from './engine/map'

export const basicTools = ['floor', 'ladder', 'start', 'goal', 'erase'] as const
export const platformTools = ['platformPressed', 'platformReleased', 'platformSwitch'] as const
export const portalTools = ['portal', 'portalSwitch'] as const

export type GroupKind = 'platform' | 'portal'
export type BasicTool = (typeof basicTools)[number]
export type PlatformTool = (typeof platformTools)[number]
export type PortalTool = (typeof portalTools)[number]
export type Brush = { tool: BasicTool } | { tool: PlatformTool | PortalTool; groupId: string }
export type EditIssue =
  MapIssue | { code: 'placePairFull' | 'selectGroup'; path: string; cell: Cell }
interface EditResult {
  map?: PuzzleMap
  issue?: EditIssue
  anchor?: Cell
}

export function ensureGroup(map: PuzzleMap, kind: GroupKind, id: string): PuzzleMap {
  if (kind === 'platform') {
    if (map.platformGroups.some((group) => group.id === id)) return map
    return {
      ...map,
      platformGroups: [...map.platformGroups, { id, platforms: [], controllers: [] }],
    }
  }
  if (map.portalPairs.some((pair) => pair.id === id)) return map
  return {
    ...map,
    portalPairs: [...map.portalPairs, { id, initiallyOpen: true, ends: [], controllers: [] }],
  }
}

function eraseCell(map: PuzzleMap, cell: Cell): EditResult {
  let changed = false
  function remove(cells: Cell[]) {
    const remaining = cells.filter((point) => !sameCell(point, cell))
    if (remaining.length === cells.length) return cells
    changed = true
    return remaining
  }
  const floors = remove(map.floors)
  const start = sameCell(map.start, cell) ? null : map.start
  const goal = sameCell(map.goal, cell) ? null : map.goal
  const ladders = map.ladders.filter(
    ({ top, bottom }) => cell.x !== top.x || cell.y < top.y || cell.y > bottom.y,
  )
  const platformGroups = map.platformGroups.map((group) => ({
    ...group,
    controllers: remove(group.controllers),
    platforms: group.platforms.flatMap((platform) => {
      const cells = remove(platform.cells)
      return cells.length ? [{ ...platform, cells }] : []
    }),
  }))
  const portalPairs = map.portalPairs.map((pair) => ({
    ...pair,
    ends: remove(pair.ends),
    controllers: remove(pair.controllers),
  }))
  if (!changed && start === map.start && goal === map.goal && ladders.length === map.ladders.length)
    return {}
  return { map: { ...map, floors, start, goal, ladders, platformGroups, portalPairs } }
}

export function editMap(
  map: PuzzleMap,
  brush: Brush,
  cell: Cell,
  otherEnd: Cell | null = null,
): EditResult {
  const draft = { ...map }
  switch (brush.tool) {
    case 'erase':
      return eraseCell(map, cell)
    case 'floor':
      if (map.floors.some((point) => sameCell(point, cell))) return {}
      draft.floors = [...map.floors, cell]
      break
    case 'start':
    case 'goal':
      if (sameCell(map[brush.tool], cell)) return {}
      draft[brush.tool] = cell
      break
    case 'ladder': {
      if (!otherEnd) return { anchor: cell }
      if (sameCell(cell, otherEnd) || cell.x !== otherEnd.x)
        return { issue: { code: 'ladder', path: '$.ladders', cell } }
      const [top, bottom] = [cell, otherEnd].sort((a, b) => a.y - b.y)
      draft.ladders = [...map.ladders, { top, bottom }]
      break
    }
    case 'platformPressed':
    case 'platformReleased':
    case 'platformSwitch': {
      const index = map.platformGroups.findIndex(({ id }) => id === brush.groupId)
      if (index < 0) return { issue: { code: 'selectGroup', path: '$.platformGroups', cell } }
      const group = map.platformGroups[index]
      const next = { ...group }
      if (brush.tool === 'platformSwitch') {
        if (group.controllers.some((point) => sameCell(point, cell))) return {}
        next.controllers = [...group.controllers, cell]
      } else {
        const enabledWhenPressed = brush.tool === 'platformPressed'
        const existing = group.platforms.find((platform) =>
          platform.cells.some((point) => sameCell(point, cell)),
        )
        if (existing) {
          if (existing.enabledWhenPressed === enabledWhenPressed) return {}
          next.platforms = group.platforms.map((platform) =>
            platform === existing ? { ...platform, enabledWhenPressed } : platform,
          )
        } else {
          const ids = new Set(group.platforms.map(({ id }) => id))
          let number = group.platforms.length + 1
          while (ids.has(`platform-${number}`)) number++
          next.platforms = [
            ...group.platforms,
            { id: `platform-${number}`, cells: [cell], enabledWhenPressed },
          ]
        }
      }
      draft.platformGroups = map.platformGroups.map((row, i) => (i === index ? next : row))
      break
    }
    case 'portal':
    case 'portalSwitch': {
      const index = map.portalPairs.findIndex(({ id }) => id === brush.groupId)
      if (index < 0) return { issue: { code: 'selectGroup', path: '$.portalPairs', cell } }
      const layer = brush.tool === 'portal' ? 'ends' : 'controllers'
      const pair = map.portalPairs[index]
      if (pair[layer].some((point) => sameCell(point, cell))) return {}
      if (layer === 'ends' && pair.ends.length === 2) {
        return { issue: { code: 'placePairFull', path: `$.portalPairs[${index}].ends`, cell } }
      }
      const next = { ...pair, [layer]: [...pair[layer], cell] }
      draft.portalPairs = map.portalPairs.map((row, i) => (i === index ? next : row))
      break
    }
  }

  const [issue] = layoutIssues(draft)
  return issue ? { issue } : { map: draft }
}
