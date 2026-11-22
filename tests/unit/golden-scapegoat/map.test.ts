import { expect, it } from 'vitest'
import { demos } from '../../../src/tools/golden-scapegoat/demos'
import {
  emptyMap,
  layoutIssues,
  prepareMap,
  readMap,
  readinessIssues,
  validateMap,
  writeMap,
} from '../../../src/tools/golden-scapegoat/engine/map'

it('round-trips both drafts and complete maps with stable link IDs', () => {
  const draft = {
    ...emptyMap(),
    portalPairs: [{ id: 'alpha', initiallyOpen: true, ends: [{ x: -99, y: 4 }], controllers: [] }],
  }
  for (const map of [draft, ...Object.values(demos)]) {
    const output = readMap(writeMap(map)!)
    expect(output).toEqual({ map, issues: [] })
  }
  expect(readinessIssues(draft).map((issue) => issue.code)).toEqual([
    'start',
    'goal',
    'k',
    'pairIncomplete',
    'portalSupport',
  ])
  expect(readinessIssues(demos.platform)).toEqual([])
})

it('defaults a legacy portal pair to closed and exports the normalized value', () => {
  const legacy = {
    ...emptyMap(),
    version: 1,
    k: 1,
    portalPairs: [
      { id: 'legacy', ends: [], controllers: [] },
      { id: 'closed', initiallyOpen: false, ends: [], controllers: [] },
      { id: 'open', initiallyOpen: true, ends: [], controllers: [] },
    ],
  }
  const { map, issues } = readMap(JSON.stringify(legacy))
  expect(issues).toEqual([])
  expect(map?.portalPairs.map(({ initiallyOpen }) => initiallyOpen)).toEqual([false, false, true])
  expect(readMap(writeMap(map!)!)).toEqual({ map, issues: [] })
})

it.each([undefined, null, 'true', 1])(
  'rejects a non-boolean initial portal value %j',
  (initiallyOpen) => {
    const { map, issues } = readMap(
      JSON.stringify({
        ...emptyMap(),
        portalPairs: [{ id: 'p', initiallyOpen, ends: [], controllers: [] }],
      }),
    )
    expect(map).toBeUndefined()
    expect(issues).toEqual([{ code: 'format', path: '$.portalPairs[0].initiallyOpen' }])
  },
)

it.each([true, false])(
  'migrates legacy polarity %s and keeps the original cells together',
  (enabledWhenPressed) => {
    const cells = [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]
    const controllers = [{ x: 1, y: 0 }]
    const { map, issues } = readMap(
      JSON.stringify({
        ...emptyMap(),
        version: 1,
        k: 1,
        platformGroups: [
          {
            id: 'legacy',
            defaultEnabled: !enabledWhenPressed,
            activatedEnabled: enabledWhenPressed,
            cells,
            controllers,
          },
        ],
      }),
    )
    expect(issues).toEqual([])
    expect(map).toMatchObject({
      version: 2,
      platformGroups: [{ id: 'legacy', controllers, platforms: [{ cells, enabledWhenPressed }] }],
    })
    expect(readMap(writeMap(map!)!)).toEqual({ map, issues: [] })
  },
)

it.each([true, false])('rejects a legacy group with the same %s state on both sides', (enabled) => {
  const { map, issues } = readMap(
    JSON.stringify({
      ...emptyMap(),
      version: 1,
      k: 1,
      platformGroups: [
        {
          id: 'legacy',
          defaultEnabled: enabled,
          activatedEnabled: enabled,
          cells: [{ x: 2, y: 0 }],
          controllers: [],
        },
      ],
    }),
  )
  expect(map).toBeUndefined()
  expect(issues).toEqual([{ code: 'legacyPlatformPolarity', path: '$.platformGroups[0]' }])
})

it('validates platform IDs, nonempty cell lists and boolean polarities within each group', () => {
  const { map, issues } = validateMap({
    ...emptyMap(),
    platformGroups: [
      {
        id: 'group',
        controllers: [],
        platforms: [
          { id: 'shared', cells: [{ x: 0, y: 0 }], enabledWhenPressed: true },
          { id: 'shared', cells: [], enabledWhenPressed: 'false' },
        ],
      },
    ],
  })
  expect(map).toBeUndefined()
  expect(issues).toEqual([
    { code: 'format', path: '$.platformGroups[0].platforms[1].cells' },
    { code: 'format', path: '$.platformGroups[0].platforms[1].enabledWhenPressed' },
    { code: 'duplicateId', path: '$.platformGroups[0].platforms[1].id' },
  ])
})

it('reports duplicate support, duplicate ladder exits and both forbidden controller overlaps', () => {
  const { x, y } = { x: 3, y: 1 }
  const at = { x, y }
  const moving = { x: 1, y: 1 }
  const top = { x: 0, y: 1 }
  const map = {
    ...emptyMap(),
    floors: [moving],
    platformGroups: [
      {
        id: 'x',
        controllers: [at],
        platforms: [{ id: 'platform', cells: [moving], enabledWhenPressed: false }],
      },
    ],
    ladders: [
      { top, bottom: { x: 0, y: 3 } },
      { top, bottom: { x: 0, y: 4 } },
    ],
    portalPairs: [{ id: 'p', initiallyOpen: false, ends: [at], controllers: [at, moving] }],
  }
  expect(validateMap(map).issues).toEqual([
    { code: 'duplicateSupport', path: '$.platformGroups[0].platforms[0].cells', cell: moving },
    { code: 'ladderExit', path: '$.ladders[1]', cell: top },
    { code: 'portalController', path: '$.portalPairs[0].controllers', cell: at },
    { code: 'platformController', path: '$.portalPairs[0].controllers', cell: moving },
  ])
  expect(validateMap({ ...emptyMap(), k: 0 }).issues).toContainEqual(
    expect.objectContaining({ code: 'k' }),
  )
  expect(readMap('{').issues).toContainEqual({ code: 'json', path: '$' })
})

it('uses one support index for draft conflicts and readiness, regardless of platform polarity', () => {
  const start = { x: 0, y: 0 }
  const goal = { x: 5, y: 0 }
  const top = { x: 1, y: 0 }
  const bottom = { x: 1, y: 2 }
  const exit = { x: 4, y: 2 }
  const draft = {
    ...emptyMap(),
    start,
    goal,
    k: 4,
    floors: [start],
    ladders: [{ top, bottom }],
    platformGroups: [
      { id: 'empty', controllers: [], platforms: [] },
      {
        id: 'ledge',
        controllers: [],
        platforms: [{ id: 'a', cells: [bottom], enabledWhenPressed: true }],
      },
    ],
    portalPairs: [
      { id: 'empty', initiallyOpen: true, ends: [], controllers: [] },
      { id: 'gate', initiallyOpen: true, ends: [bottom, exit], controllers: [] },
    ],
  }
  expect(readMap(writeMap(draft)!)).toEqual({ map: draft, issues: [] })
  expect(prepareMap(draft)).toEqual({
    issues: [
      {
        code: 'platformMissingController',
        path: '$.platformGroups[1].controllers',
        group: { kind: 'platform', index: 1 },
      },
      { code: 'ladderTopSupport', path: '$.ladders[0].top', cell: top },
      {
        code: 'portalSupport',
        path: '$.portalPairs[1].ends[1]',
        cell: exit,
        group: { kind: 'portal', index: 1 },
      },
    ],
  })
  expect(readinessIssues({ ...draft, platformGroups: [] }).map(({ code }) => code)).toContain(
    'ladderBottomSupport',
  )
  const complete = {
    ...draft,
    floors: [start, top, exit],
    platformGroups: [draft.platformGroups[0], { ...draft.platformGroups[1], controllers: [start] }],
  }
  expect(prepareMap(complete)).toEqual({ map: complete, issues: [] })

  const doubleFloor = { ...complete, floors: [...complete.floors, start] }
  expect(layoutIssues(doubleFloor)).toMatchObject([{ code: 'duplicateSupport', cell: start }])
  const overlap = {
    ...complete,
    platformGroups: [
      complete.platformGroups[1],
      {
        id: 'overlap',
        controllers: [],
        platforms: [{ id: 'b', cells: [bottom], enabledWhenPressed: false }],
      },
    ],
  }
  expect(readMap(writeMap(overlap)!).issues).toMatchObject([
    { code: 'duplicateSupport', cell: bottom },
  ])
})

it('preserves an unfilled v2 K and never promotes it to a ready map', () => {
  const draft = { ...demos.platform, k: null }
  expect(emptyMap().k).toBeNull()
  expect(readMap(writeMap(draft)!)).toEqual({ map: draft, issues: [] })
  expect(prepareMap(draft)).toEqual({ issues: [{ code: 'k', path: '$.k' }] })
  for (const k of [undefined, '3', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(validateMap({ ...draft, k }).issues).toContainEqual(
      expect.objectContaining({ code: 'k' }),
    )
  }
  expect(validateMap({ ...emptyMap(), version: 1 }).issues).toContainEqual(
    expect.objectContaining({ code: 'k' }),
  )
  expect(prepareMap({ ...draft, k: 3 }).map?.k).toBe(3)
})

it('preserves valid files near the size limit by using compact JSON when needed', () => {
  const map = {
    ...emptyMap(),
    floors: Array.from({ length: 25_000 }, (_, x) => ({ x, y: 0 })),
  }
  const source = writeMap(map)!
  expect(source).toBe(JSON.stringify(map))
  expect(readMap(source)).toEqual({ map, issues: [] })
})
