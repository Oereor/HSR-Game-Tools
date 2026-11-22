export interface Cell {
  x: number
  y: number
}

export interface ControlledPlatform {
  id: string
  cells: Cell[]
  enabledWhenPressed: boolean
}

export interface PlatformGroup {
  id: string
  controllers: Cell[]
  platforms: ControlledPlatform[]
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
  version: 2
  k: number | null
  start: Cell | null
  goal: Cell | null
  floors: Cell[]
  platformGroups: PlatformGroup[]
  ladders: Ladder[]
  portalPairs: PortalPair[]
}

export type ReadyMap = PuzzleMap & { k: number; start: Cell; goal: Cell }
export const validRecordSteps = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
export const coordinateLimit = 1_000_000
export const mapFileLimit = 1024 * 1024
export const cellKey = ({ x, y }: Cell) => `${x},${y}`
export const sameCell = (a: Cell | null, b: Cell | null) => !!a && !!b && a.x === b.x && a.y === b.y
export const platformEnabled = (platform: ControlledPlatform, pressed: boolean) =>
  platform.enabledWhenPressed === pressed

export function emptyMap(): PuzzleMap {
  return {
    version: 2,
    k: null,
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
  | 'legacyPlatformPolarity'
  | 'coordinate'
  | 'k'
  | 'duplicateId'
  | 'duplicateCell'
  | 'duplicateSupport'
  | 'ladder'
  | 'ladderExit'
  | 'ladderTopSupport'
  | 'ladderBottomSupport'
  | 'portalEnds'
  | 'portalEndpoint'
  | 'portalSupport'
  | 'platformController'
  | 'platformMissingController'
  | 'portalController'
  | 'start'
  | 'goal'
  | 'pairIncomplete'

export interface MapIssue {
  code: MapIssueCode
  path: string
  cell?: Cell
  group?: { kind: 'platform' | 'portal'; index: number }
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

  function readPlatformGroup(value: unknown, path: string, legacy: boolean): PlatformGroup {
    const group = record(
      value,
      path,
      legacy
        ? ['id', 'controllers', 'cells', 'defaultEnabled', 'activatedEnabled']
        : ['id', 'controllers', 'platforms'],
    )
    const id = typeof group.id === 'string' ? group.id : ''
    const controllers = cells(group.controllers, `${path}.controllers`)
    if (legacy) {
      const { defaultEnabled, activatedEnabled } = group
      if (typeof defaultEnabled !== 'boolean') report('format', `${path}.defaultEnabled`)
      if (typeof activatedEnabled !== 'boolean') report('format', `${path}.activatedEnabled`)
      if (typeof defaultEnabled === 'boolean' && defaultEnabled === activatedEnabled)
        report('legacyPlatformPolarity', path)
      const points = cells(group.cells, `${path}.cells`)
      const platforms = points.length
        ? [{ id: 'platform-1', cells: points, enabledWhenPressed: activatedEnabled === true }]
        : []
      return { id, controllers, platforms }
    }
    const platforms = groups(group.platforms, `${path}.platforms`, (item, at) => {
      const platform = record(item, at, ['id', 'cells', 'enabledWhenPressed'])
      const points = cells(platform.cells, `${at}.cells`)
      if (Array.isArray(platform.cells) && !platform.cells.length) report('format', `${at}.cells`)
      if (typeof platform.enabledWhenPressed !== 'boolean')
        report('format', `${at}.enabledWhenPressed`)
      return {
        id: typeof platform.id === 'string' ? platform.id : '',
        cells: points,
        enabledWhenPressed: platform.enabledWhenPressed === true,
      }
    })
    return { id, controllers, platforms }
  }

  const root = record(value, '$', Object.keys(emptyMap()))
  const legacy = root.version === 1
  if (!legacy && root.version !== 2) {
    report('version', '$.version')
    return { issues }
  }
  const k = validRecordSteps(root.k) ? root.k : null
  if (k === null && (legacy || root.k !== null)) report('k', '$.k')
  const map: PuzzleMap = {
    version: 2,
    k,
    start: root.start === null ? null : cell(root.start, '$.start'),
    goal: root.goal === null ? null : cell(root.goal, '$.goal'),
    floors: cells(root.floors, '$.floors'),
    platformGroups: groups(root.platformGroups, '$.platformGroups', (item, at) =>
      readPlatformGroup(item, at, legacy),
    ),
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
      const initiallyOpen =
        legacy && !Object.hasOwn(pair, 'initiallyOpen') ? false : pair.initiallyOpen
      if (typeof initiallyOpen !== 'boolean') report('format', `${at}.initiallyOpen`)
      const ends = cells(pair.ends, `${at}.ends`)
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

function inspectLayout(map: PuzzleMap) {
  const issues: MapIssue[] = []
  const supports = new Set<string>()
  const moving = new Set<string>()
  const ends = new Set<string>()
  const exits = new Set<string>()
  function addSupport(cell: Cell, path: string) {
    const key = cellKey(cell)
    if (supports.has(key)) issues.push({ code: 'duplicateSupport', path, cell })
    supports.add(key)
  }
  map.floors.forEach((cell) => addSupport(cell, '$.floors'))
  map.platformGroups.forEach((group, index) =>
    group.platforms.forEach((platform, platformIndex) => {
      const path = `$.platformGroups[${index}].platforms[${platformIndex}].cells`
      platform.cells.forEach((cell) => {
        addSupport(cell, path)
        moving.add(cellKey(cell))
      })
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
  map.portalPairs.forEach((pair, index) => {
    const path = `$.portalPairs[${index}].ends`
    if (pair.ends.length > 2) issues.push({ code: 'portalEnds', path, cell: pair.ends[2] })
    pair.ends.forEach((cell) => {
      const key = cellKey(cell)
      if (ends.has(key)) issues.push({ code: 'portalEndpoint', path, cell })
      ends.add(key)
    })
  })
  const checkControllers = (controllers: Cell[], path: string, ownEnds?: Set<string>) =>
    controllers.forEach((cell) => {
      const key = cellKey(cell)
      if (moving.has(key)) issues.push({ code: 'platformController', path, cell })
      if (ownEnds?.has(key)) issues.push({ code: 'portalController', path, cell })
    })
  map.platformGroups.forEach((group, i) =>
    checkControllers(group.controllers, `$.platformGroups[${i}].controllers`),
  )
  map.portalPairs.forEach((pair, i) =>
    checkControllers(
      pair.controllers,
      `$.portalPairs[${i}].controllers`,
      new Set(pair.ends.map(cellKey)),
    ),
  )
  return { issues, supports }
}

export function layoutIssues(map: PuzzleMap): MapIssue[] {
  return inspectLayout(map).issues
}

export function readinessIssues(map: PuzzleMap): MapIssue[] {
  return prepareMap(map).issues
}

export function prepareMap(map: PuzzleMap): { map?: ReadyMap; issues: MapIssue[] } {
  const { issues, supports } = inspectLayout(map)
  const { k, start, goal } = map
  if (!start) issues.push({ code: 'start', path: '$.start' })
  if (!goal) issues.push({ code: 'goal', path: '$.goal' })
  if (!validRecordSteps(k)) issues.push({ code: 'k', path: '$.k' })
  map.platformGroups.forEach((group, index) => {
    if (group.platforms.length && !group.controllers.length) {
      issues.push({
        code: 'platformMissingController',
        path: `$.platformGroups[${index}].controllers`,
        group: { kind: 'platform', index },
      })
    }
  })
  map.ladders.forEach(({ top, bottom }, index) => {
    const path = `$.ladders[${index}]`
    if (!supports.has(cellKey(top)))
      issues.push({ code: 'ladderTopSupport', path: `${path}.top`, cell: top })
    if (!supports.has(cellKey(bottom)))
      issues.push({ code: 'ladderBottomSupport', path: `${path}.bottom`, cell: bottom })
  })
  map.portalPairs.forEach((pair, index) => {
    const path = `$.portalPairs[${index}].ends`
    const group = { kind: 'portal', index } as const
    if (pair.ends.length < 2 && (pair.ends.length || pair.controllers.length))
      issues.push({ code: 'pairIncomplete', path, group })
    pair.ends.forEach((cell, end) => {
      if (!supports.has(cellKey(cell)))
        issues.push({ code: 'portalSupport', path: `${path}[${end}]`, cell, group })
    })
  })
  return issues.length || k === null || start === null || goal === null
    ? { issues }
    : { map: { ...map, k, start, goal }, issues }
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
    ...map.platformGroups.flatMap(({ platforms, controllers }) => [
      ...platforms.flatMap(({ cells }) => cells),
      ...controllers,
    ]),
    ...map.ladders.flatMap(({ top, bottom }) => [top, bottom]),
    ...map.portalPairs.flatMap(({ ends, controllers }) => [...ends, ...controllers]),
    ...(map.start ? [map.start] : []),
    ...(map.goal ? [map.goal] : []),
  ]
}
