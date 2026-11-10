import { describe, expect, it } from 'vitest'
import {
  PLANNER_FORMAT,
  PLANNER_VERSION,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import type { EventAnchor } from '../../../src/tools/action-planner/engine/types'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

const envelope = (version: number, document: unknown) => ({
  format: PLANNER_FORMAT,
  version,
  document,
})
const restore = { id: 'opening', type: 'restoreSkillPoints', source: 'Opening', amount: 2 }
const conditional = {
  id: 'refund',
  type: 'conditionalRestore',
  source: 'Selected refund',
  phase: 'postAction',
  sourceParticipantId: 'editor-1',
  amount: 1,
  chance: 0.5,
  cooldownTurns: 0,
  outcome: 'no-proc',
}
function legacy() {
  const doc = syntheticDocument()
  return {
    ...doc,
    plan: {
      ...doc.plan,
      skillPoints: { enabled: true, initial: 0 } as Record<string, unknown>,
      events: doc.plan.events.map(({ anchor, operations }) => ({
        anchor,
        operations: operations.map((op) => ({ ...op })) as Record<string, unknown>[],
        ...({} as { skill?: unknown }),
      })),
    },
  }
}

describe('planner document versions', () => {
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
  })

  const gates: [number, string, (doc: ReturnType<typeof legacy>) => void][] = [
    [4, 'SP settings', () => {}],
    [5, 'explicit restoration', (doc) => doc.plan.events[0].operations.push(restore)],
    [
      6,
      'insufficiency policy',
      (doc) => Object.assign(doc.plan.skillPoints, { onInsufficient: 'mark' }),
    ],
    [
      7,
      'overflow',
      (doc) => doc.plan.events[0].operations.push({ ...restore, storeOverflow: false }),
    ],
    [8, 'cap modifiers', (doc) => Object.assign(doc.plan.skillPoints, { maxModifiers: null })],
    [
      9,
      'conditional restoration',
      (doc) => {
        doc.plan.events[1].skill = { kind: 'skill' }
        doc.plan.events[1].operations.push(conditional)
      },
    ],
  ]
  it.each(gates)('accepts v%i %s and rejects it one version earlier', (version, _field, add) => {
    const doc = legacy()
    add(doc)
    expect(validatePlannerFile(envelope(version, doc)).migration?.fromVersion).toBe(version)
    expect(() => validatePlannerFile(envelope(version - 1, doc))).toThrow('structure')
  })

  it('converts old costs and recovery in their settlement order and avoids orphan IDs', () => {
    const doc = legacy()
    const action = doc.plan.events[1]
    action.skill = { kind: 'custom', cost: 3, recovery: 4 }
    action.operations.push(
      { ...restore, id: 'before', phase: 'preAction' },
      { ...restore, id: 'after', phase: 'postAction' },
    )
    doc.plan.events.push({
      anchor: { kind: 'trigger', participantId: 'spawn:legacy-sp-1' } satisfies EventAnchor,
      operations: [],
    })
    const input = envelope(9, doc)
    const original = structuredClone(input)
    const parsed = validatePlannerFile(input)
    expect(input).toEqual(original)
    expect(parsed.migration?.skillPoints?.losses).toEqual({})
    const changes = parsed.document.plan.events[1].operations.filter(
      (op) => op.type === 'changeSkillPoints',
    )
    expect(changes.filter((op) => op.phase === 'preAction').map((op) => op.amount)).toEqual([2, -3])
    expect(changes.filter((op) => op.phase === 'postAction').map((op) => op.amount)).toEqual([4, 2])
    expect(changes.map((op) => op.id)).not.toContain('legacy-sp-1')
    expect(parsed.document.metadata.customNames).toMatchObject({
      before: 'Opening',
      after: 'Opening',
    })
    expect(parsed.document.plan.events[2].anchor).toEqual(doc.plan.events[2].anchor)
    const exported = serializePlannerDocument(parsed.document)
    expect(JSON.parse(exported).version).toBe(PLANNER_VERSION)
    expect(parsePlannerDocument(exported).document).toEqual(parsed.document)
  })

  it('freezes legacy cap and reports settings that require review, including dormant annotations', () => {
    const doc = legacy()
    Object.assign(doc.plan.skillPoints, {
      initial: 6,
      max: 5,
      maxModifiers: [{ amount: 2, sourceParticipantId: 'editor-1' }, { amount: 1 }],
      onInsufficient: 'stop',
      storedMax: 2,
    })
    doc.plan.events[0].operations.push({ ...restore, storeOverflow: true })
    doc.plan.events[1].skill = { kind: 'skill' }
    doc.plan.events[1].operations.push(conditional)
    doc.plan.events.push({
      anchor: { kind: 'action', participantId: 'enemy-1', turn: 1 },
      operations: [],
      skill: { kind: 'basic' },
    })
    const parsed = validatePlannerFile(envelope(9, doc))
    expect(parsed.document.plan.skillPoints).toEqual({ enabled: true, initial: 6, max: 8 })
    expect(parsed.document.plan.events).toHaveLength(2)
    expect(parsed.document.plan.events[0].operations).toContainEqual({
      id: 'opening',
      type: 'changeSkillPoints',
      amount: 2,
    })
    expect(parsed.document.plan.events[1].operations.some((op) => op.id === 'refund')).toBe(false)
    expect(parsed.migration?.skillPoints?.losses).toEqual({
      dynamicMax: 1,
      policy: 1,
      storage: 2,
      conditionalRestore: 1,
      inactiveSkill: 1,
    })
    expect(() => validatePlannerFile(envelope(PLANNER_VERSION, doc))).toThrow('structure')
    doc.plan.events[1].operations.at(-1)!.sourceParticipantId = 'enemy-1'
    expect(() => validatePlannerFile(envelope(9, doc))).toThrow('structure')
  })

  it('writes signed operations and rejects malformed current inputs and legacy fields', () => {
    const doc = syntheticDocument()
    doc.plan.skillPoints = { enabled: false, initial: 0, max: 0 }
    const opening = { id: 'sp', type: 'changeSkillPoints', amount: -2 } as const
    doc.plan.events[0].operations.push(opening)
    expect(parsePlannerDocument(serializePlannerDocument(doc)).document).toEqual(doc)
    expect(() => validatePlannerFile(envelope(9, doc))).toThrow('structure')
    for (const fields of [{ amount: 0.5 }, { amount: '1' }, { target: { kind: 'allies' } }]) {
      const forged = structuredClone(doc)
      Object.assign(forged.plan.events[0].operations.at(-1)!, fields)
      expect(() => serializePlannerDocument(forged)).toThrow('structure')
    }
    Object.assign(doc.plan.skillPoints, { current: 0 })
    expect(() => serializePlannerDocument(doc)).toThrow('structure')
  })
})
