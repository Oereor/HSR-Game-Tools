import { describe, expect, it } from 'vitest'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  applyOperations,
  previewOperationState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import type {
  ActorConfig,
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationResult,
} from '../../../src/tools/action-planner/engine/types'
import {
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'

const start = { kind: 'start' } as const
const action = (participantId: string, turn = 1): EventAnchor => ({
  kind: 'action',
  participantId,
  turn,
})
const actor = (id: string, position: number, extra: Partial<ActorConfig> = {}): ActorConfig => ({
  id,
  position,
  kind: 'actor',
  camp: 'ally',
  name: id,
  baseSpeed: 100,
  panelSpeed: 100,
  ...extra,
})
const ultimate = (
  id: string,
  sourceParticipantId = 'sparkle',
  phase?: EffectPhase,
): EffectOperation => ({
  id,
  type: 'characterEffect',
  effectId: 'sparkle.ultimate',
  sourceParticipantId,
  ...(phase ? { phase } : {}),
})
const sp = (id: string, amount: number, phase?: EffectPhase): EffectOperation => ({
  id,
  type: 'changeSkillPoints',
  amount,
  ...(phase ? { phase } : {}),
})
const target = (id: string) => ({ kind: 'participants' as const, participantIds: [id] })
function fixture(initial = 5) {
  const doc = emptyDocument()
  doc.plan.actors = [actor('ally', 0, { initialAG: 0 }), actor('sparkle', 1)]
  doc.metadata.characterIds = { sparkle: '1306', ally: '1001' }
  doc.plan.skillPoints = { enabled: true, initial, max: 7 }
  doc.plan.maxNodes = 6
  return doc
}
const run = (doc: ReturnType<typeof fixture>) => simulatePlan(doc.plan, doc.metadata.characterIds)
const refillsAt = (result: SimulationResult, index: number) => {
  const record = result.records[index]
  return record && record.kind !== 'cycleBoundary' ? record.sparkleRefills : undefined
}

describe('Sparkle skill point storage', () => {
  it('recovers through debt, stores only ultimate overflow, and records capped waste', () => {
    const doc = fixture()
    doc.plan.events = [
      {
        anchor: start,
        operations: [
          ultimate('wrong-source', 'ally'),
          sp('debt', -12),
          ultimate('first'),
          ultimate('second'),
          ultimate('third'),
          sp('manual-recovery', 6),
          ultimate('fourth'),
          ultimate('fifth'),
        ],
      },
    ]
    const result = run(doc)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'character-effect-source',
        operationId: 'wrong-source',
      }),
    )
    expect(result.characterEffectOutcomes).toMatchObject([
      {
        skillPoints: { before: -7n, after: -1n },
        resource: { before: 0, after: 0 },
        wastedSkillPoints: 0,
      },
      {
        skillPoints: { before: -1n, after: 5n },
        resource: { before: 0, after: 0 },
        wastedSkillPoints: 0,
      },
      {
        skillPoints: { before: 5n, after: 7n },
        resource: { before: 0, after: 4 },
        wastedSkillPoints: 0,
      },
      {
        skillPoints: { before: 7n, after: 7n },
        resource: { before: 4, after: 10 },
        wastedSkillPoints: 0,
      },
      {
        skillPoints: { before: 7n, after: 7n },
        resource: { before: 10, after: 10 },
        wastedSkillPoints: 6,
      },
    ])
    expect(result.snapshots[0]?.skillPoints?.current).toBe(7n)
    expect(refillsAt(result, 0)).toBeUndefined()
  })

  it('refills after the complete post-action group and recomputes after history edits', () => {
    const doc = fixture()
    const first = action('ally')
    const operations = [
      sp('pre-cost', -1, 'preAction'),
      sp('post-cost', -4, 'postAction'),
      sp('post-recovery', 2, 'postAction'),
    ]
    doc.plan.events = [
      { anchor: start, operations: [ultimate('opening')] },
      { anchor: first, operations },
      { anchor: action('ally', 2), operations: [sp('deeper-cost', -9, 'postAction')] },
    ]
    const planner = useActionPlanner(doc.plan, doc.metadata)
    const initial = planner.result.value
    const preview = previewOperationState(
      initial.records[0]!.beforeEffects,
      operations,
      first,
      'postAction',
      'post-recovery',
    )!
    expect(applyOperations(preview, [operations[2]!], first).state.skillPoints?.current).toBe(4n)
    expect(refillsAt(initial, 0)).toEqual([
      {
        sourceParticipantId: 'sparkle',
        skillPoints: { before: 4n, after: 7n },
        storedSP: { before: 4, after: 1 },
      },
    ])
    expect(refillsAt(initial, 1)).toMatchObject([
      {
        skillPoints: { before: -2n, after: -1n },
        storedSP: { before: 1, after: 0 },
      },
    ])
    expect(refillsAt(initial, 2)).toBeUndefined()
    expect(initial.snapshots[0]?.skillPoints?.current).toBe(7n)
    planner.select(first)
    planner.move('post-recovery', -1)
    expect(refillsAt(planner.result.value, 0)).toMatchObject([
      {
        skillPoints: { before: 3n, after: 7n },
        storedSP: { before: 4, after: 0 },
      },
    ])
    planner.remove('post-recovery')
    expect(refillsAt(planner.result.value, 0)).toMatchObject([
      {
        skillPoints: { before: 2n, after: 6n },
        storedSP: { before: 4, after: 0 },
      },
    ])
    planner.select(start)
    planner.remove('opening')
    expect(
      planner.result.value.records.every((_, index) => !refillsAt(planner.result.value, index)),
    ).toBe(true)
  })

  it.each(['advance', 'immediatelyAct'] as const)(
    'refills on the resulting turn, rather than during %s',
    (type) => {
      const doc = fixture(7)
      doc.plan.actors[0]!.initialAG = 5000
      const scheduling: EffectOperation =
        type === 'advance'
          ? { id: 'pull', type, target: target('ally'), percent: 100 }
          : { id: 'pull', type, target: target('ally') }
      doc.plan.events = [
        {
          anchor: start,
          operations: [ultimate('store'), sp('spend', -3), scheduling],
        },
      ]
      const result = run(doc)
      expect(result.snapshots[0]?.skillPoints?.current).toBe(4n)
      expect(result.records[0]).toMatchObject({ anchor: action('ally'), elapsedAV: 0 })
      expect(refillsAt(result, 0)).toMatchObject([{ skillPoints: { before: 4n, after: 7n } }])
    },
  )

  it.each([
    'enemy',
    'custom',
    'summon',
    'memosprite',
    'dynamic',
    'dynamicCharacter',
    'timer',
    'aha',
    'cycle',
  ] as const)('recognizes whether the %s node ends a qualifying turn', (kind) => {
    const doc = fixture(7)
    doc.plan.actors = [actor('sparkle', 1, { initialAG: 20000 })]
    doc.metadata.characterIds = { sparkle: '1306' }
    doc.plan.maxNodes = 1
    const operations = [ultimate('store'), sp('spend', -3)]
    if (kind === 'aha') doc.plan.aha.contributorIds = ['sparkle']
    else if (kind === 'cycle') doc.plan.cycleMode = 'moc'
    else if (kind === 'timer')
      operations.push({
        id: 'created',
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'Timer', speed: 100, initialAG: 0 },
      })
    else if (kind === 'dynamic' || kind === 'dynamicCharacter')
      operations.push({
        id: 'created',
        type: 'spawnParticipant',
        participant: {
          kind: 'actor',
          camp: 'ally',
          name: 'Created',
          baseSpeed: 100,
          panelSpeed: 100,
          initialAG: 0,
          ...(kind === 'dynamicCharacter' ? { category: 'character' } : {}),
        },
      })
    else
      doc.plan.actors.push(
        actor('first', 0, {
          initialAG: 0,
          category: kind,
          camp: kind === 'enemy' ? 'enemy' : 'ally',
        }),
      )
    doc.plan.events = [{ anchor: start, operations }]
    const result = run(doc)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]?.kind).toBe(
      kind === 'timer'
        ? 'scheduledEvent'
        : kind === 'aha'
          ? 'aha'
          : kind === 'cycle'
            ? 'cycleBoundary'
            : 'actor',
    )
    expect(result.snapshots[1]?.skillPoints?.current).toBe(kind === 'dynamicCharacter' ? 7n : 4n)
    if (kind !== 'dynamicCharacter') expect(refillsAt(result, 0)).toBeUndefined()
  })

  it('drains multiple stores by roster order, including a departed source but excluding a retired source', () => {
    const doc = fixture(7)
    doc.plan.actors.unshift(actor('second-sparkle', 2, { initialAG: 5000, actionLimit: 1 }))
    doc.metadata.characterIds['second-sparkle'] = '1306'
    doc.plan.events = [
      {
        anchor: start,
        operations: [
          ultimate('second-store', 'second-sparkle'),
          ultimate('first-store'),
          { id: 'depart', type: 'depart', target: target('sparkle') },
        ],
      },
      { anchor: action('ally'), operations: [sp('big-cost', -8, 'postAction')] },
      { anchor: action('second-sparkle'), operations: [sp('last-cost', -1, 'postAction')] },
      { anchor: action('ally', 2), operations: [sp('next-cost', -1, 'postAction')] },
    ]
    const result = run(doc)
    expect(refillsAt(result, 0)).toMatchObject([
      {
        sourceParticipantId: 'sparkle',
        storedSP: { before: 6, after: 0 },
        skillPoints: { before: -1n, after: 5n },
      },
      {
        sourceParticipantId: 'second-sparkle',
        storedSP: { before: 6, after: 4 },
        skillPoints: { before: 5n, after: 7n },
      },
    ])
    expect(refillsAt(result, 1)).toMatchObject([
      { sourceParticipantId: 'second-sparkle', storedSP: { before: 4, after: 3 } },
    ])
    expect(refillsAt(result, 2)).toBeUndefined()
    expect(result.snapshots[3]?.skillPoints?.current).toBe(6n)
  })

  it('persists one authored ultimate and regenerates refill records on reopening', () => {
    const doc = fixture(7)
    doc.plan.events = [{ anchor: action('ally'), operations: [sp('cost', -3, 'postAction')] }]
    const planner = useActionPlanner(doc.plan, doc.metadata)
    planner.addSkillPoints('postAction')
    expect(
      planner.submitPreset({ id: 'sparkle-ultimate', values: {}, translate: (key) => key }),
    ).toBe(true)
    expect(planner.operations.value).toMatchObject([
      { type: 'characterEffect', effectId: 'sparkle.ultimate' },
    ])
    const serialized = serializePlannerDocument(planner.document.value)
    expect(serialized).not.toMatch(/sparkleRefills|storedSP/)
    expect(() =>
      parsePlannerDocument(JSON.stringify({ ...JSON.parse(serialized), version: 12 })),
    ).toThrow('structure')
    const reopened = useActionPlanner()
    expect(reopened.restoreDocument(parsePlannerDocument(serialized).document)).toBe(true)
    expect(reopened.result.value).toEqual(planner.result.value)
    const disabled = run({
      ...reopened.document.value,
      plan: { ...reopened.plan.value, skillPoints: { enabled: false } },
    })
    expect(disabled.characterEffectOutcomes).toEqual([])
    expect(refillsAt(disabled, 0)).toBeUndefined()
    expect(disabled.records.map(({ anchor, elapsedAV }) => ({ anchor, elapsedAV }))).toEqual(
      reopened.result.value.records.map(({ anchor, elapsedAV }) => ({ anchor, elapsedAV })),
    )
  })
})
