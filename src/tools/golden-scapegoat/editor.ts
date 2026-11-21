import { layoutIssues, sameCell, type Cell, type MapIssue, type PuzzleMap } from './engine/map'

export const tools = [
  'floor',
  'ladder',
  'platform',
  'platformSwitch',
  'portal',
  'portalSwitch',
  'start',
  'goal',
] as const
export type EditTool = (typeof tools)[number]
export type EditIssue =
  MapIssue | { code: 'placePairFull' | 'selectGroup'; path: string; cell: Cell }

function editCells(cells: Cell[], cell: Cell, erase: boolean) {
  if (erase) return cells.filter((point) => !sameCell(point, cell))
  return cells.some((point) => sameCell(point, cell)) ? cells : [...cells, cell]
}

export function editMap(
  map: PuzzleMap,
  tool: EditTool,
  cell: Cell,
  erase: boolean,
  groupId: string | undefined,
  otherEnd: Cell | null,
): { map?: PuzzleMap; issue?: EditIssue; anchor?: Cell } {
  const draft = { ...map }
  switch (tool) {
    case 'floor':
      draft.floors = editCells(map.floors, cell, erase)
      break
    case 'start':
    case 'goal':
      draft[tool] = erase ? (sameCell(map[tool], cell) ? null : map[tool]) : cell
      break
    case 'ladder':
      if (erase) {
        draft.ladders = map.ladders.filter(
          ({ top, bottom }) => cell.x !== top.x || cell.y < top.y || cell.y > bottom.y,
        )
      } else if (!otherEnd) {
        return { anchor: cell }
      } else if (!sameCell(cell, otherEnd)) {
        const [top, bottom] = [cell, otherEnd].sort((a, b) => a.y - b.y)
        draft.ladders = [...map.ladders, { top, bottom }]
      } else {
        return { issue: { code: 'ladder', path: '$.ladders', cell } }
      }
      break
    case 'platform':
    case 'platformSwitch': {
      if (!map.platformGroups.some((group) => group.id === groupId)) {
        return { issue: { code: 'selectGroup', path: '$.platformGroups', cell } }
      }
      const layer = tool === 'platform' ? 'cells' : 'controllers'
      draft.platformGroups = map.platformGroups.map((group) =>
        group.id === groupId ? { ...group, [layer]: editCells(group[layer], cell, erase) } : group,
      )
      break
    }
    case 'portal':
    case 'portalSwitch': {
      const index = map.portalPairs.findIndex((pair) => pair.id === groupId)
      if (index === -1) return { issue: { code: 'selectGroup', path: '$.portalPairs', cell } }
      const layer = tool === 'portal' ? 'ends' : 'controllers'
      const pair = map.portalPairs[index]
      const cells = editCells(pair[layer], cell, erase)
      if (layer === 'ends' && cells.length > 2) {
        return { issue: { code: 'placePairFull', path: `$.portalPairs[${index}].ends`, cell } }
      }
      draft.portalPairs = map.portalPairs.map((row, i) =>
        i === index ? { ...row, [layer]: cells } : row,
      )
      break
    }
  }

  const [issue] = layoutIssues(draft)
  return issue ? { issue } : { map: draft }
}

export function nextGroupId(prefix: string, groups: { id: string }[]) {
  const ids = new Set(groups.map(({ id }) => id))
  let index = groups.length + 1
  while (ids.has(`${prefix}-${index}`)) index++
  return `${prefix}-${index}`
}
