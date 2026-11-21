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
    portalPairs: [{ id: 'alpha', ends: [{ x: -99, y: 4 }], controllers: [] }],
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
        defaultEnabled: true,
        activatedEnabled: false,
        cells: [moving],
        controllers: [at],
      },
    ],
    ladders: [
      { top, bottom: { x: 0, y: 3 } },
      { top, bottom: { x: 0, y: 4 } },
    ],
    portalPairs: [{ id: 'p', ends: [at], controllers: [moving] }],
  }
  expect(validateMap(map).issues).toEqual([
    { code: 'duplicateSupport', path: '$.platformGroups[0].cells', cell: moving },
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
