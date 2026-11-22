import { expect, it } from 'vitest'
import { demos } from '../../../src/tools/golden-scapegoat/demos'
import {
  emptyMap,
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
    'pairIncomplete',
  ])
  expect(readinessIssues(demos.platform)).toEqual([])
})

it('defaults a legacy portal pair to closed and exports the normalized value', () => {
  const legacy = {
    ...emptyMap(),
    version: 1,
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

it('reports bad schema, duplicate support and ladder exits, and distinguishes the two controller overlaps', () => {
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
    portalPairs: [{ id: 'p', initiallyOpen: false, ends: [at], controllers: [moving] }],
  }
  expect(validateMap(map).issues).toEqual([
    { code: 'duplicateSupport', path: '$.platformGroups[0].platforms[0].cells', cell: moving },
    { code: 'ladderExit', path: '$.ladders[1]', cell: top },
    { code: 'portalController', path: '$.platformGroups[0].controllers', cell: at },
    { code: 'platformController', path: '$.portalPairs[0].controllers', cell: moving },
  ])
  expect(validateMap({ ...emptyMap(), k: 0 }).issues).toContainEqual(
    expect.objectContaining({ code: 'k' }),
  )
  expect(readMap('{').issues).toContainEqual({ code: 'json', path: '$' })
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
