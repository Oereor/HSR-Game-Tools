import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  cloneState,
  previewOperationState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import type {
  ActorConfig,
  CharacterEffectId,
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationResult,
} from '../../../src/tools/action-planner/engine/types'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  emptyDocument,
  parsePlannerDocument,
  PLANNER_VERSION,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'
import { buildBattleSetup, setupDraft } from '../../../src/tools/action-planner/model/battle-setup'

const start = { kind: 'start' } as const
const action = (participantId: string, turn: number): EventAnchor => ({
  kind: 'action',
  participantId,
  turn,
})
const actor = (id: string, position: number): ActorConfig => ({
  id,
  position,
  kind: 'actor',
  camp: 'ally',
  name: 'Same display name',
  baseSpeed: 100,
  panelSpeed: 100,
  initialAG: 0,
})
const effect = (
  id: string,
  effectId: CharacterEffectId,
  sourceParticipantId: string,
  phase?: EffectPhase,
): EffectOperation => ({
  id,
  type: 'characterEffect',
  effectId,
  sourceParticipantId,
  ...(phase ? { phase } : {}),
})
const ult = (id: string, phase?: EffectPhase) =>
  effect(id, 'archer.ultimateCharge', 'archer', phase)
const chase = (id: string, phase?: EffectPhase) => effect(id, 'archer.followUp', 'archer', phase)
const refund = (id: string, phase: EffectPhase = 'postAction') =>
  effect(id, 'bronya.e1.refund', 'bronya', phase)
const sp = (id: string, amount: number, phase?: EffectPhase): EffectOperation => ({
  id,
  type: 'changeSkillPoints',
  amount,
  ...(phase ? { phase } : {}),
})

function fixture() {
  const doc = emptyDocument()
  doc.plan.actors = [actor('bronya', 0), actor('ally', 1), actor('archer', 2)]
  doc.plan.skillPoints = { enabled: true, initial: 4, max: 5 }
  doc.plan.maxNodes = 12
  doc.metadata.characterIds = { archer: '1015', bronya: '1101' }
  return doc
}

const run = ({ plan, metadata }: ReturnType<typeof fixture>) =>
  simulatePlan(plan, metadata.characterIds)
const settled = (result: SimulationResult, id: string) =>
  result.characterEffectOutcomes.find((entry) => entry.operationId === id)

describe('character skill point effects', () => {
  it('configures Archer charge and records capped charge and actual SP for consecutive follow-ups', () => {
    const doc = fixture()
    const setup = setupDraft(doc.plan, doc.metadata)
    setup.allies[2]!.initialArcherCharge = 3
    const built = buildBattleSetup(setup.allies, setup.enemies, doc.plan.maxNodes, doc.plan.maxAV)
    expect(built.invalid).toEqual([])
    doc.plan.actors = built.actors
    doc.plan.events = [
      {
        anchor: start,
        operations: [
          ult('ult'),
          ult('capped-ult'),
          chase('first'),
          chase('full'),
          chase('third'),
          chase('fourth'),
          chase('empty'),
          sp('after-empty', -2),
        ],
      },
    ]
    const result = run(doc)
    expect(settled(result, 'ult')?.charge).toEqual({ before: 3, after: 4 })
    expect(settled(result, 'ult')?.skillPoints).toEqual({ before: 4n, after: 4n })
    expect(settled(result, 'capped-ult')?.charge).toEqual({ before: 4, after: 4 })
    expect(settled(result, 'first')?.skillPoints).toEqual({ before: 4n, after: 5n })
    expect(settled(result, 'full')).toMatchObject({
      charge: { before: 3, after: 2 },
      skillPoints: { before: 5n, after: 5n },
    })
    expect(settled(result, 'fourth')?.charge).toEqual({ before: 1, after: 0 })
    expect(settled(result, 'empty')).toBeUndefined()
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'archer-no-charge',
        operationId: 'empty',
      }),
    )
    expect(result.snapshots[0]?.skillPoints?.current).toBe(3n)
    expect(result.records.length).toBeGreaterThan(0)
  })

  it('reorders and deletes earlier operations, with the same result in preview and replay', () => {
    const doc = fixture()
    doc.plan.events = [
      { anchor: start, operations: [ult('ult'), chase('opening')] },
      { anchor: action('bronya', 1), operations: [chase('later', 'preAction')] },
    ]
    const planner = useActionPlanner(doc.plan, doc.metadata)
    const original = planner.result.value
    const later = doc.plan.events[1]!
    const preview = previewOperationState(
      original.records[0]!.beforeEffects,
      later.operations,
      later.anchor,
      'preAction',
      'later',
    )!
    expect(
      applyOperations(preview, later.operations, later.anchor).characterEffectOutcomes[0],
    ).toEqual(settled(original, 'later'))
    planner.move('opening', -1)
    expect(settled(planner.result.value, 'opening')).toBeUndefined()
    expect(settled(planner.result.value, 'ult')?.charge).toEqual({ before: 0, after: 2 })
    expect(original.records[0]?.elapsedAV).toBe(0)
    expect(planner.result.value.records[0]?.elapsedAV).toBe(0)
    expect(settled(planner.result.value, 'later')?.charge).toEqual({ before: 2, after: 1 })
    expect(settled(original, 'later')?.charge).toEqual({ before: 1, after: 0 })
    planner.remove('ult')
    expect(settled(planner.result.value, 'later')).toBeUndefined()
    expect(
      planner.result.value.diagnostics.filter((entry) => entry.code === 'archer-no-charge'),
    ).toHaveLength(2)
  })

  it('tracks Bronya’s own turns across both phases, an ally’s action and immediate action at the same AV', () => {
    const doc = fixture()
    doc.plan.skillPoints!.initial = 5
    doc.plan.events = [
      { anchor: action('bronya', 1), operations: [refund('first', 'preAction'), refund('repeat')] },
      {
        anchor: action('ally', 1),
        operations: [
          refund('wrong-node'),
          {
            id: 'pull',
            type: 'immediatelyAct',
            phase: 'postAction',
            target: {
              kind: 'participants',
              participantIds: ['bronya'],
            },
          },
        ],
      },
      {
        anchor: action('bronya', 2),
        operations: [refund('still-cooling', 'preAction'), sp('basic', 1, 'postAction')],
      },
      { anchor: action('bronya', 3), operations: [sp('skill', -1, 'preAction'), refund('ready')] },
    ]
    const result = run(doc)
    expect(settled(result, 'first')).toMatchObject({
      skillPoints: { before: 5n, after: 5n },
      availableFromTurn: 3,
    })
    expect(
      result.diagnostics
        .filter((entry) => entry.code === 'bronya-e1-cooldown')
        .map((entry) => entry.operationId),
    ).toEqual(['repeat', 'still-cooling'])
    const firstTurn = doc.plan.events[0]!
    const postPreview = previewOperationState(
      result.records[0]!.beforeEffects,
      firstTurn.operations,
      firstTurn.anchor,
      'postAction',
      'repeat',
    )!
    expect(
      applyOperations(postPreview, [firstTurn.operations[1]!], firstTurn.anchor).diagnostics,
    ).toEqual(result.diagnostics.filter((entry) => entry.operationId === 'repeat'))
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'character-effect-anchor',
        operationId: 'wrong-node',
      }),
    )
    expect(
      result.records.find(
        (record) =>
          record.anchor.kind === 'action' &&
          record.anchor.participantId === 'bronya' &&
          record.anchor.turn === 2,
      )?.elapsedAV,
    ).toBe(0)
    expect(settled(result, 'ready')).toMatchObject({
      skillPoints: { before: 4n, after: 5n },
      availableFromTurn: 5,
    })

    const turnTwo = result.records.find(
      (record) =>
        record.anchor.kind === 'action' &&
        record.anchor.participantId === 'bronya' &&
        record.anchor.turn === 2,
    )!
    const copy = cloneState(turnTwo.beforeEffects)
    const copiedEffect = copy.characterEffects?.get('bronya')
    if (copiedEffect?.kind !== 'bronya') throw new Error('Bronya missing')
    delete copiedEffect.availableFromTurn['bronya.e1.refund']
    expect(
      applyOperations(copy, [refund('probe', 'preAction')], turnTwo.anchor).diagnostics,
    ).toEqual([])
    expect(
      applyOperations(turnTwo.beforeEffects, [refund('probe', 'preAction')], turnTwo.anchor)
        .diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'bronya-e1-cooldown' }))

    const planner = useActionPlanner(doc.plan, doc.metadata)
    planner.select(action('bronya', 1))
    planner.remove('first')
    expect(settled(planner.result.value, 'repeat')?.availableFromTurn).toBe(3)
    planner.remove('repeat')
    expect(settled(planner.result.value, 'still-cooling')?.availableFromTurn).toBe(4)
    expect(settled(planner.result.value, 'ready')).toBeUndefined()
  })

  it('keeps unavailable sources and orphan anchors, and ignores all SP operations when disabled', () => {
    const doc = fixture()
    const target = { kind: 'participants', participantIds: ['archer'] } as const
    doc.plan.events = [
      {
        anchor: start,
        operations: [
          ult('ult'),
          effect('wrong-source', 'archer.ultimateCharge', 'ally'),
          {
            id: 'leave',
            type: 'depart',
            target: { ...target, participantIds: [...target.participantIds] },
          },
          sp('cost', -1),
        ],
      },
      { anchor: action('bronya', 1), operations: [chase('absent', 'postAction')] },
      { anchor: action('archer', 1), operations: [chase('orphan', 'postAction')] },
    ]
    const result = run(doc)
    expect(
      result.diagnostics
        .filter((entry) => entry.code === 'character-effect-source')
        .map((entry) => entry.operationId),
    ).toEqual(['wrong-source', 'absent'])
    expect(result.snapshots[0]?.skillPoints?.current).toBe(3n)
    const disabled = run({ ...doc, plan: { ...doc.plan, skillPoints: { enabled: false } } })
    expect(disabled.characterEffectOutcomes).toEqual([])
    expect(disabled.diagnostics.map((entry) => entry.code)).toEqual(['unreached-anchor'])
    expect(disabled.records.map(({ anchor, elapsedAV }) => ({ anchor, elapsedAV }))).toEqual(
      result.records.map(({ anchor, elapsedAV }) => ({ anchor, elapsedAV })),
    )

    const planner = useActionPlanner(doc.plan, doc.metadata)
    const actors = doc.plan.actors.map((a) =>
      a.id === 'archer' ? actor('replacement', a.position) : a,
    )
    expect(
      planner.applySetup(actors, doc.plan.maxNodes, doc.plan.maxAV, {
        bronya: '1101',
        replacement: '1015',
      }),
    ).toBe(true)
    expect(planner.result.value.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'character-effect-source',
        operationId: 'ult',
        participantId: 'archer',
      }),
    )
    expect(planner.unreached.value.map((event) => event.anchor)).toContainEqual(action('archer', 1))
    expect(planner.plan.value.events[0]?.operations[0]).toEqual(ult('ult'))
  })
})

describe('character effect editor, presets and files', () => {
  const request = (id: string, reuseSkillPointCostId?: string) => ({
    id,
    reuseSkillPointCostId,
    values: {},
    translate: (key: string) => key,
  })
  it('applies the Bronya batch once per submission and requires explicit reuse of an existing cost', () => {
    const doc = fixture()
    const planner = useActionPlanner(doc.plan, doc.metadata)
    planner.select(action('bronya', 1))
    planner.addSkillPoints('preAction')
    expect(planner.submitPreset(request('bronya-e1-skill'))).toBe(true)
    expect(planner.operations.value.map((op) => op.type)).toEqual([
      'changeSkillPoints',
      'characterEffect',
    ])
    expect(planner.result.value.characterEffectOutcomes[0]?.skillPoints).toEqual({
      before: 3n,
      after: 4n,
    })

    const cost = planner.operations.value.find((op) => op.type === 'changeSkillPoints')!
    planner.addSkillPoints('postAction')
    planner.draft.value!.amount = -1
    expect(planner.submit()).toBe(true)
    const existingCosts = planner.operations.value.filter((op) => op.type === 'changeSkillPoints')
    planner.addSkillPoints('postAction')
    const previous = planner.document.value
    expect(planner.presetIssues.value['bronya-e1-skill']).toBe('skillPointCost')
    expect(planner.submitPreset(request('bronya-e1-skill'))).toBe(false)
    expect(planner.submitPreset(request('bronya-e1-skill', 'stale-id'))).toBe(false)
    expect(planner.document.value).toBe(previous)
    expect(planner.submitPreset(request('bronya-e1-skill', cost.id))).toBe(true)
    expect(planner.operations.value.filter((op) => op.type === 'changeSkillPoints')).toEqual(
      existingCosts,
    )
    const last = planner.operations.value.at(-1)!
    expect(last).toMatchObject({ type: 'characterEffect', phase: cost.phase })
    expect(planner.result.value.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'bronya-e1-cooldown',
        operationId: last.id,
      }),
    )
  })

  it('round-trips authored effects and charge through export, import and local save', () => {
    const doc = fixture()
    doc.plan.actors[2]!.initialArcherCharge = 1
    const planner = useActionPlanner(doc.plan, doc.metadata)
    planner.addSkillPoints('postAction')
    expect(planner.submitPreset(request('archer-follow-up'))).toBe(true)
    planner.select(action('bronya', 1))
    planner.addSkillPoints('postAction')
    Object.assign(planner.draft.value!, {
      type: 'characterEffect',
      effectId: 'bronya.e1.refund',
      sourceParticipantId: 'bronya',
      customName: 'Confirmed E1',
    })
    expect(planner.submit()).toBe(true)
    const current = planner.document.value
    expect(planner.operations.value.map((op) => op.type)).toEqual(['characterEffect'])
    const exported = serializePlannerDocument(current)
    expect(JSON.parse(exported).version).toBe(PLANNER_VERSION)
    expect(() => validatePlannerFile({ ...JSON.parse(exported), version: 10 })).toThrow('structure')
    const imported = parsePlannerDocument(exported).document
    expect(imported).toEqual(current)
    let saved: string | null = null
    const persistence = () =>
      createPlannerPersistence(() => ({
        getItem: () => saved,
        setItem: (_key, value) => {
          saved = value
        },
      }))
    const storage = persistence()
    storage.initialize()
    expect(storage.save(imported)).toBe(true)
    const reopened = useActionPlanner()
    expect(reopened.restoreDocument(persistence().initialize().document)).toBe(true)
    expect(reopened.result.value).toEqual(planner.result.value)
    expect(reopened.document.value.metadata.customNames).toEqual(current.metadata.customNames)
    expect(reopened.result.value.characterEffectOutcomes).toHaveLength(2)
  })
})
