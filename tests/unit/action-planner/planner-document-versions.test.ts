import { describe, expect, it } from 'vitest'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import type { SkillPointsConfig } from '../../../src/tools/action-planner/engine/types'
import {
  PLANNER_FORMAT,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import type { PlannerDocument } from '../../../src/tools/action-planner/model/editor'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

const envelope = (version: number, document: unknown) => ({
  format: PLANNER_FORMAT,
  version,
  document,
})
const openingRestore = {
  id: 'opening',
  type: 'restoreSkillPoints',
  amount: 2,
  source: 'Opening recovery',
} as const
const conditional = {
  id: 'refund',
  type: 'conditionalRestore',
  phase: 'postAction',
  sourceParticipantId: 'editor-1',
  source: 'Selected refund',
  amount: 1,
  chance: 0.5,
  cooldownTurns: 0,
  outcome: 'no-proc',
} as const
const gates: [number, string, (document: PlannerDocument) => void][] = [
  [4, 'skillPoints', (doc) => (doc.plan.skillPoints = { enabled: false, initial: 0, max: 5 })],
  [4, 'action skill', (doc) => (doc.plan.events[1]!.skill = { kind: 'skill' })],
  [5, 'explicit restoration', (doc) => doc.plan.events[0]!.operations.push({ ...openingRestore })],
  [
    6,
    'onInsufficient',
    (doc) => (doc.plan.skillPoints = { ...doc.plan.skillPoints, onInsufficient: 'mark' }),
  ],
  [7, 'storedMax', (doc) => (doc.plan.skillPoints = { ...doc.plan.skillPoints, storedMax: 0 })],
  [
    7,
    'storeOverflow',
    (doc) => {
      const event = doc.plan.events[0]!
      event.operations = [
        ...event.operations.filter((operation) => operation.id !== openingRestore.id),
        { ...openingRestore, storeOverflow: false },
      ]
    },
  ],
  [
    8,
    'maxModifiers',
    (doc) => {
      doc.plan.skillPoints = {
        ...doc.plan.skillPoints,
        maxModifiers: [{ amount: 2, sourceParticipantId: 'editor-1' }, { amount: -1 }],
      }
    },
  ],
  [
    9,
    'conditional restoration',
    (doc) => {
      const event = doc.plan.events[1]!
      event.skill = { kind: 'skill' }
      event.operations.push({ ...conditional })
    },
  ],
]

function documentFor(version: number) {
  const doc = syntheticDocument()
  for (const [since, , add] of gates) if (version >= since) add(doc)
  return doc
}

describe('versioned planner document contract', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('migrates v%i to a stable v9 document', (version) => {
    const expected = documentFor(version)
    if (version >= 2) expected.plan.cycleMode = 'aa'
    if (version >= 3)
      expected.plan.aha = { id: 'saved-aha', baseSpeed: 97, contributorIds: ['editor-1'] }
    const { aha, cycleMode, ...plan } = expected.plan
    const input = envelope(version, {
      ...expected,
      plan: {
        ...plan,
        ...(version >= 2 ? { cycleMode } : {}),
        ...(version >= 3 ? { aha } : {}),
      },
    })
    const before = structuredClone(input)
    const parsed = validatePlannerFile(input)
    expect(parsed.migration).toEqual({ fromVersion: version, ahaAdded: false })
    expect(parsed.document).toStrictEqual(expected)
    expect(input).toStrictEqual(before)
    expect(parsePlannerDocument(JSON.stringify(input))).toEqual(parsed)
    const source = serializePlannerDocument(parsed.document)
    expect(JSON.parse(source)).toStrictEqual(envelope(9, expected))
    const reopened = parsePlannerDocument(source)
    expect(reopened.migration).toBeUndefined()
    expect(serializePlannerDocument(reopened.document)).toBe(source)
    expect(simulatePlan(reopened.document.plan)).toEqual(simulatePlan(expected.plan))
  })

  it.each(gates)(
    'accepts v%i %s and rejects the same field in the prior version',
    (version, _field, add) => {
      const doc = syntheticDocument()
      add(doc)
      expect(validatePlannerFile(envelope(version, doc)).document).toStrictEqual(doc)
      expect(validatePlannerFile(envelope(version - 1, syntheticDocument())).document).toEqual(
        syntheticDocument(),
      )
      expect(() => validatePlannerFile(envelope(version - 1, doc))).toThrow('structure')
    },
  )

  it('requires cycle mode from v2 and saved Aha configuration from v3', () => {
    const doc = syntheticDocument()
    const { aha, cycleMode, ...originalPlan } = doc.plan
    const v1 = { ...doc, plan: originalPlan }
    const v2 = { ...doc, plan: { ...originalPlan, cycleMode } }
    const v3 = { ...doc, plan: { ...v2.plan, aha } }
    expect(validatePlannerFile(envelope(1, v1)).document).toEqual(doc)
    expect(validatePlannerFile(envelope(2, v2)).document).toEqual(doc)
    expect(validatePlannerFile(envelope(3, v3)).document).toEqual(doc)
    expect(() => validatePlannerFile(envelope(1, v2))).toThrow('structure')
    expect(() => validatePlannerFile(envelope(2, v1))).toThrow('structure')
    expect(() => validatePlannerFile(envelope(2, v3))).toThrow('structure')
    expect(() => validatePlannerFile(envelope(3, v2))).toThrow('structure')

    const boundary = { anchor: { kind: 'cycleBoundary', ordinal: 1 }, operations: [] }
    const events = [...originalPlan.events, boundary]
    expect(
      validatePlannerFile(envelope(2, { ...v2, plan: { ...v2.plan, events } })).document.plan
        .events,
    ).toEqual(events)
    expect(() => validatePlannerFile(envelope(1, { ...v1, plan: { ...v1.plan, events } }))).toThrow(
      'structure',
    )
  })

  it.each([4, 5, 6, 7, 8, 9])(
    'keeps optional skill-point settings and skills absent in v%i',
    (version) => {
      const doc = syntheticDocument()
      const parsed = validatePlannerFile(envelope(version, doc)).document
      expect(parsed).toStrictEqual(doc)
      expect(parsePlannerDocument(serializePlannerDocument(parsed)).document).toStrictEqual(doc)
    },
  )

  it.each<SkillPointsConfig>([
    {},
    { enabled: false, initial: 0, max: 0, storedMax: 0 },
    { enabled: true, initial: 0, max: 0, storedMax: 0 },
  ])('preserves explicitly authored settings %j', (config) => {
    const doc = syntheticDocument()
    doc.plan.skillPoints = config
    const parsed = parsePlannerDocument(serializePlannerDocument(doc)).document
    expect(parsed.plan.skillPoints).toStrictEqual(config)
  })

  it.each([8, 9])('preserves explicit null max modifiers in v%i', (version) => {
    const doc = syntheticDocument()
    doc.plan.skillPoints = { enabled: true, initial: 0, maxModifiers: null }
    const reopened = parsePlannerDocument(
      serializePlannerDocument(validatePlannerFile(envelope(version, doc)).document),
    )
    expect(reopened.document).toStrictEqual(doc)
    const empty = { ...doc.plan, skillPoints: { enabled: true, initial: 0, maxModifiers: [] } }
    const omitted = { ...doc.plan, skillPoints: { enabled: true, initial: 0 } }
    expect(simulatePlan(reopened.document.plan)).toEqual(simulatePlan(empty))
    expect(simulatePlan(reopened.document.plan)).toEqual(simulatePlan(omitted))
    expect(() => validatePlannerFile(envelope(7, doc))).toThrow('structure')
  })

  it('writes v9 with exact target-free operations, action skills, and skill-only events', () => {
    const doc = documentFor(9)
    doc.plan.events[0]!.operations.push(
      { ...openingRestore, id: 'without-overflow' },
      { ...openingRestore, id: 'with-overflow', storeOverflow: true },
    )
    doc.plan.events[1]!.operations.push({ ...openingRestore, id: 'pre-action', phase: 'preAction' })
    doc.plan.events.push(
      {
        anchor: { kind: 'action', participantId: 'editor-1', turn: 2 },
        skill: { kind: 'skill' },
        operations: [{ ...conditional, id: 'proc', outcome: 'proc', cooldownTurns: 2 }],
      },
      {
        anchor: { kind: 'action', participantId: 'editor-1', turn: 3 },
        skill: { kind: 'basic' },
        operations: [],
      },
      {
        anchor: { kind: 'action', participantId: 'editor-1', turn: 4 },
        skill: { kind: 'custom', cost: 0, recovery: 0 },
        operations: [],
      },
    )
    const source = serializePlannerDocument(doc)
    expect(JSON.parse(source)).toStrictEqual(envelope(9, doc))
    expect(parsePlannerDocument(source)).toStrictEqual({ document: doc, issues: [] })
    expect(() => parsePlannerDocument(JSON.stringify(envelope(10, doc)))).toThrow('version')
  })

  const invalidFields: [string, (document: PlannerDocument) => void][] = [
    ['derived result', (doc) => Object.assign(doc, { result: {} })],
    ['current balance', (doc) => Object.assign(doc.plan.skillPoints!, { current: null })],
    ['stored balance', (doc) => Object.assign(doc.plan.skillPoints!, { stored: 0 })],
    ['cooldown state', (doc) => Object.assign(doc.plan.skillPoints!, { conditionalCooldowns: {} })],
    ['null initial balance', (doc) => Object.assign(doc.plan.skillPoints!, { initial: null })],
    ['non-array modifiers', (doc) => Object.assign(doc.plan.skillPoints!, { maxModifiers: {} })],
    [
      'orphan cap source',
      (doc) =>
        Object.assign(doc.plan.skillPoints!, {
          maxModifiers: [{ amount: 1, sourceParticipantId: 'missing' }],
        }),
    ],
    ['unknown skill field', (doc) => Object.assign(doc.plan.events[1]!.skill!, { paid: 0 })],
    [
      'forged recovery target',
      (doc) =>
        Object.assign(doc.plan.events[0]!.operations.at(-1)!, { target: { kind: 'allies' } }),
    ],
    [
      'runtime refund expiry',
      (doc) => Object.assign(doc.plan.events[1]!.operations.at(-1)!, { availableFromTurn: 4 }),
    ],
    [
      'mismatched refund source',
      (doc) =>
        Object.assign(doc.plan.events[1]!.operations.at(-1)!, {
          sourceParticipantId: 'spawn:spawn',
        }),
    ],
  ]
  it.each(invalidFields)('rejects %s on an otherwise valid v9 document', (_name, mutate) => {
    const doc = documentFor(9)
    expect(parsePlannerDocument(serializePlannerDocument(doc)).document).toStrictEqual(doc)
    mutate(doc)
    expect(() => validatePlannerFile(envelope(9, doc))).toThrow('structure')
    expect(() => serializePlannerDocument(doc)).toThrow('structure')
  })
})
