export interface Cell {
  x: number
  y: number
}

export interface PlatformGroup {
  id: string
  defaultEnabled: boolean
  activatedEnabled: boolean
  cells: Cell[]
  controllers: Cell[]
}

export interface PortalPair {
  id: string
  initiallyOpen: boolean
  ends: Cell[]
  controllers: Cell[]
}

export interface Ladder {
  top: Cell
  bottom: Cell
}

export interface PuzzleMap {
  version: 1
  k: number
  start: Cell | null
  goal: Cell | null
  floors: Cell[]
  platformGroups: PlatformGroup[]
  ladders: Ladder[]
  portalPairs: PortalPair[]
}

export type ReadyMap = PuzzleMap & { start: Cell; goal: Cell }
export const coordinateLimit = 1_000_000
export const mapFileLimit = 1024 * 1024
export const cellKey = ({ x, y }: Cell) => `${x},${y}`
export const sameCell = (a: Cell | null, b: Cell | null) => !!a && !!b && a.x === b.x && a.y === b.y

export function emptyMap(): PuzzleMap {
  return {
    version: 1,
    k: 1,
    start: null,
    goal: null,
    floors: [],
    platformGroups: [],
    ladders: [],
    portalPairs: [],
  }
}

export type MapIssueCode =
  | 'json'
  | 'fileLimit'
  | 'format'
  | 'version'
  | 'coordinate'
  | 'k'
  | 'duplicateId'
  | 'duplicateCell'
  | 'duplicateSupport'
  | 'ladder'
  | 'ladderExit'
  | 'portalEnds'
  | 'portalEndpoint'
  | 'platformController'
  | 'portalController'
  | 'start'
  | 'goal'
  | 'pairIncomplete'

export interface MapIssue {
  code: MapIssueCode
  path: string
  cell?: Cell
}

export function validateMap(value: unknown): { map?: PuzzleMap; issues: MapIssue[] } {
  const issues: MapIssue[] = []
  const report = (code: MapIssueCode, path: string, cell?: Cell) =>
    issues.push({ code, path, cell })

  function record(value: unknown, path: string, fields: string[]): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>
      for (const key of Object.keys(record)) {
        if (!fields.includes(key)) report('format', `${path}.${key}`)
      }
      return record
    }
    report('format', path)
    return {}
  }

  function cell(value: unknown, path: string): Cell | null {
    const { x, y } = record(value, path, ['x', 'y'])
    if (
      typeof x !== 'number' ||
      !Number.isSafeInteger(x) ||
      Math.abs(x) > coordinateLimit ||
      typeof y !== 'number' ||
      !Number.isSafeInteger(y) ||
      Math.abs(y) > coordinateLimit
    ) {
      report('coordinate', path)
      return null
    }
    return { x, y }
  }

  function list<T>(
    value: unknown,
    path: string,
    read: (value: unknown, path: string) => T | null,
  ): T[] {
    if (!Array.isArray(value)) {
      report('format', path)
      return []
    }
    return value.flatMap((item, index) => {
      const parsed = read(item, `${path}[${index}]`)
      return parsed === null ? [] : [parsed]
    })
  }

  function cells(value: unknown, path: string): Cell[] {
    const seen = new Set<string>()
    return list(value, path, (item, at) => {
      const point = cell(item, at)
      if (point) {
        const key = cellKey(point)
        if (seen.has(key)) report('duplicateCell', at, point)
        seen.add(key)
      }
      return point
    })
  }

  function groups<T extends { id: string }>(
    value: unknown,
    path: string,
    read: (value: unknown, path: string) => T,
  ): T[] {
    const ids = new Set<string>()
    return list(value, path, (item, at) => {
      const group = read(item, at)
      if (!group.id.trim()) report('format', `${at}.id`)
      else if (ids.has(group.id)) report('duplicateId', `${at}.id`)
      ids.add(group.id)
      return group
    })
  }

  const root = record(value, '$', Object.keys(emptyMap()))
  if (root.version !== 1) report('version', '$.version')
  const k = typeof root.k === 'number' ? root.k : 0
  if (!Number.isSafeInteger(k) || k < 1) report('k', '$.k')
  const map: PuzzleMap = {
    version: 1,
    k,
    start: root.start === null ? null : cell(root.start, '$.start'),
    goal: root.goal === null ? null : cell(root.goal, '$.goal'),
    floors: cells(root.floors, '$.floors'),
    platformGroups: groups(root.platformGroups, '$.platformGroups', (item, at) => {
      const group = record(item, at, [
        'id',
        'defaultEnabled',
        'activatedEnabled',
        'cells',
        'controllers',
      ])
      if (typeof group.defaultEnabled !== 'boolean') report('format', `${at}.defaultEnabled`)
      if (typeof group.activatedEnabled !== 'boolean') report('format', `${at}.activatedEnabled`)
      return {
        id: typeof group.id === 'string' ? group.id : '',
        defaultEnabled: group.defaultEnabled === true,
        activatedEnabled: group.activatedEnabled === true,
        cells: cells(group.cells, `${at}.cells`),
        controllers: cells(group.controllers, `${at}.controllers`),
      }
    }),
    ladders: list(root.ladders, '$.ladders', (item, at) => {
      const ladder = record(item, at, ['top', 'bottom'])
      const top = cell(ladder.top, `${at}.top`)
      const bottom = cell(ladder.bottom, `${at}.bottom`)
      if (!top || !bottom) return null
      if (top.x !== bottom.x || top.y >= bottom.y) report('ladder', at, top)
      return { top, bottom }
    }),
    portalPairs: groups(root.portalPairs, '$.portalPairs', (item, at) => {
      const pair = record(item, at, ['id', 'initiallyOpen', 'ends', 'controllers'])
      const initiallyOpen = Object.hasOwn(pair, 'initiallyOpen') ? pair.initiallyOpen : false
      if (typeof initiallyOpen !== 'boolean') report('format', `${at}.initiallyOpen`)
      const ends = cells(pair.ends, `${at}.ends`)
      if (ends.length > 2) report('portalEnds', `${at}.ends`)
      return {
        id: typeof pair.id === 'string' ? pair.id : '',
        initiallyOpen: initiallyOpen === true,
        ends,
        controllers: cells(pair.controllers, `${at}.controllers`),
      }
    }),
  }
  if (issues.length) return { issues }
  return { map, issues: layoutIssues(map) }
}

export function layoutIssues(map: PuzzleMap): MapIssue[] {
  const issues: MapIssue[] = []
  const supports = new Set(map.floors.map(cellKey))
  const moving = new Set<string>()
  const ends = new Set<string>()
  const exits = new Set<string>()
  map.platformGroups.forEach((group, index) =>
    group.cells.forEach((cell) => {
      const key = cellKey(cell)
      if (supports.has(key))
        issues.push({ code: 'duplicateSupport', path: `$.platformGroups[${index}].cells`, cell })
      supports.add(key)
      moving.add(key)
    }),
  )
  map.ladders.forEach(({ top, bottom }, index) => {
    const path = `$.ladders[${index}]`
    if (top.x !== bottom.x || top.y >= bottom.y) issues.push({ code: 'ladder', path, cell: top })
    for (const [direction, cell] of [
      ['down', top],
      ['up', bottom],
    ] as const) {
      const key = `${direction}:${cellKey(cell)}`
      if (exits.has(key)) issues.push({ code: 'ladderExit', path, cell })
      exits.add(key)
    }
  })
  map.portalPairs.forEach((pair, index) =>
    pair.ends.forEach((cell) => {
      const key = cellKey(cell)
      if (ends.has(key))
        issues.push({ code: 'portalEndpoint', path: `$.portalPairs[${index}].ends`, cell })
      ends.add(key)
    }),
  )
  const checkControllers = (controllers: Cell[], path: string) =>
    controllers.forEach((cell) => {
      const key = cellKey(cell)
      if (moving.has(key)) issues.push({ code: 'platformController', path, cell })
      if (ends.has(key)) issues.push({ code: 'portalController', path, cell })
    })
  map.platformGroups.forEach((group, i) =>
    checkControllers(group.controllers, `$.platformGroups[${i}].controllers`),
  )
  map.portalPairs.forEach((pair, i) =>
    checkControllers(pair.controllers, `$.portalPairs[${i}].controllers`),
  )
  return issues
}

export function readinessIssues(map: PuzzleMap): MapIssue[] {
  const issues: MapIssue[] = []
  if (!map.start) issues.push({ code: 'start', path: '$.start' })
  if (!map.goal) issues.push({ code: 'goal', path: '$.goal' })
  map.portalPairs.forEach((pair, i) => {
    if (pair.ends.length !== 2)
      issues.push({ code: 'pairIncomplete', path: `$.portalPairs[${i}].ends` })
  })
  return issues
}

export function readMap(source: string): ReturnType<typeof validateMap> {
  if (new TextEncoder().encode(source).length > mapFileLimit) {
    return { issues: [{ code: 'fileLimit', path: '$' }] }
  }
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return { issues: [{ code: 'json', path: '$' }] }
  }
  return validateMap(value)
}

export function writeMap(map: PuzzleMap): string | undefined {
  const encoder = new TextEncoder()
  const pretty = JSON.stringify(map, null, 2)
  if (encoder.encode(pretty).length <= mapFileLimit) return pretty
  const compact = JSON.stringify(map)
  if (encoder.encode(compact).length <= mapFileLimit) return compact
}

export function authoredCells(map: PuzzleMap): Cell[] {
  return [
    ...map.floors,
    ...map.platformGroups.flatMap(({ cells, controllers }) => [...cells, ...controllers]),
    ...map.ladders.flatMap(({ top, bottom }) => [top, bottom]),
    ...map.portalPairs.flatMap(({ ends, controllers }) => [...ends, ...controllers]),
    ...(map.start ? [map.start] : []),
    ...(map.goal ? [map.goal] : []),
  ]
}
