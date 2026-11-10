import { describe, expect, it } from 'vitest'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import type {
  ActorConfig,
  CharacterEffectParameters,
  EffectOperation,
  EffectPhase,
  EventAnchor,
} from '../../../src/tools/action-planner/engine/types'
import { buildBattleSetup, setupDraft } from '../../../src/tools/action-planner/model/battle-setup'
import {
  emptyDocument,
  parsePlannerDocument,
  PLANNER_VERSION,
  preparePlannerDocument,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'

const start = { kind: 'start' } as const
const action = (participantId: string, turn = 1): EventAnchor => ({
  kind: 'action',
  participantId,
  turn,
})
const actor = (id: string, position: number): ActorConfig => ({
  id,
  position,
  kind: 'actor',
  name: 'Same display name',
  camp: 'ally',
  baseSpeed: 100,
  panelSpeed: 100,
  initialAG: 0,
})
const effect = (
  id: string,
  sourceParticipantId: string,
  parameters: CharacterEffectParameters,
  phase?: EffectPhase,
): EffectOperation => ({
  id,
  type: 'characterEffect',
  sourceParticipantId,
  ...parameters,
  ...(phase ? { phase } : {}),
})
const sp = (id: string, amount: number, phase?: EffectPhase): EffectOperation => ({
  id,
  type: 'changeSkillPoints',
  amount,
  ...(phase ? { phase } : {}),
})
const lunaeUlt = (id: string) => effect(id, 'lunae', { effectId: 'imbibitorLunae.ultimate' })
const request = (id: string, values = {}) => ({ id, values, translate: (key: string) => key })

function fixture() {
  const doc = emptyDocument()
  doc.plan.actors = [actor('ally', 0), actor('lunae', 1)]
  doc.metadata.characterIds = { lunae: '1213', ally: '1001' }
  doc.plan.skillPoints = { enabled: true, initial: 5, max: 5 }
  doc.plan.maxNodes = 15
  return doc
}
const run = (doc: ReturnType<typeof fixture>) => simulatePlan(doc.plan, doc.metadata.characterIds)

describe('character substitute skill points', () => {
  it('applies the Technique and Squama cap, then pays all three enhancement tiers', () => {
    const doc = fixture()
    doc.plan.events = [
      { anchor: start, operations: [sp('manual', -3), lunaeUlt('gain'), lunaeUlt('cap')] },
      ...([1, 3, 2] as const).map((cost, index) => ({
        anchor: action('lunae', index + 1),
        operations: [
          effect(
            `tier-${cost}`,
            'lunae',
            { effectId: 'imbibitorLunae.enhancedBasic', cost },
            'preAction',
          ),
          ...(index === 2 ? [sp('second-negative', -1, 'postAction')] : []),
        ],
      })),
    ]
    expect(run(doc).characterEffectOutcomes[0]?.resource).toEqual({
      kind: 'squama',
      before: 0,
      after: 2,
    })
    const draft = setupDraft(doc.plan, doc.metadata)
    draft.allies[1]!.imbibitorLunaeTechnique = true
    const setup = buildBattleSetup(draft.allies, draft.enemies, doc.plan.maxNodes, doc.plan.maxAV)
    expect(setup.invalid).toEqual([])
    doc.plan.actors = setup.actors
    const result = run(doc)
    const [gain, capped, ...payments] = result.characterEffectOutcomes
    expect(gain).toMatchObject({
      resource: { before: 1, after: 3 },
      skillPoints: { before: 2n, after: 2n },
    })
    expect(capped?.resource).toMatchObject({ before: 3, after: 3 })
    expect(payments.map((entry) => entry.payment)).toEqual([
      { nominalCost: 1, substituteUsed: 1, actualSpCost: 0 },
      { nominalCost: 3, substituteUsed: 2, actualSpCost: 1 },
      { nominalCost: 2, substituteUsed: 0, actualSpCost: 2 },
    ])
    expect(payments.at(-1)?.skillPoints.after).toBe(-1n)
    expect(
      result.diagnostics.filter((entry) => entry.code.startsWith('sp-negative')),
    ).toMatchObject([{ code: 'sp-negative-first', operationId: 'tier-2' }])
    expect(result.records.map((record) => record.anchor)).toContainEqual(action('lunae', 4))
  })

  it('commits E2 resource gain and ordinary action advance together', () => {
    const doc = fixture()
    doc.plan.actors[1]!.initialAG = 6000
    const planner = useActionPlanner(doc.plan, doc.metadata)
    planner.select(action('lunae'))
    planner.addSkillPoints('preAction')
    const before = planner.document.value
    expect(planner.presetIssues.value['imbibitor-lunae-ultimate-e2']).toBe('activeTarget')
    expect(planner.submitPreset(request('imbibitor-lunae-ultimate-e2'))).toBe(false)
    expect(planner.document.value).toBe(before)

    planner.select(action('ally'))
    planner.addSkillPoints('postAction')
    expect(planner.submitPreset(request('imbibitor-lunae-ultimate-e2'))).toBe(true)
    expect(planner.operations.value).toMatchObject([
      { type: 'characterEffect', sourceParticipantId: 'lunae' },
      { type: 'advance', percent: 100, target: { participantIds: ['lunae'] } },
    ])
    const result = planner.result.value
    expect(result.characterEffectOutcomes[0]?.resource).toMatchObject({ before: 0, after: 3 })
    const firstLunae = result.records.find((record) => 'id' in record && record.id === 'lunae')
    expect(firstLunae?.elapsedAV).toBe(0)
    expect(firstLunae?.actionChanges).toMatchObject([{ type: 'advance', afterAG: 0 }])
    const disabled = run({
      ...planner.document.value,
      plan: { ...planner.plan.value, skillPoints: { enabled: false } },
    })
    expect(disabled.characterEffectOutcomes).toEqual([])
    const timeline = (simulation: typeof disabled) =>
      simulation.records.map(({ anchor, elapsedAV }) => ({ anchor, elapsedAV }))
    expect(timeline(disabled)).toEqual(timeline(result))
  })

  it('defaults a new enhanced basic to tier three and preserves the saved tier on cancel', () => {
    const doc = fixture()
    const planner = useActionPlanner(doc.plan, doc.metadata)
    planner.select(action('lunae'))
    planner.addSkillPoints('postAction')
    expect(planner.submitPreset(request('imbibitor-lunae-enhanced-basic'))).toBe(true)
    const operation = planner.operations.value[0]!
    expect(operation).toMatchObject({ cost: 3, sourceParticipantId: 'lunae', phase: 'postAction' })

    const committed = planner.document.value
    planner.edit(operation)
    expect(planner.draft.value!.effectCost).toBe(3)
    planner.draft.value!.effectCost = 1
    planner.cancel()
    expect(planner.document.value).toBe(committed)
    planner.edit(operation)
    expect(planner.draft.value!.effectCost).toBe(3)
  })

  it('copies and edits a payment, round-trips it through storage, and preserves orphan identity', () => {
    const doc = fixture()
    doc.plan.actors[1]!.imbibitorLunaeTechnique = true
    const planner = useActionPlanner(doc.plan, doc.metadata)
    planner.select(action('lunae'))
    planner.addSkillPoints('postAction')
    expect(planner.submitPreset(request('imbibitor-lunae-enhanced-basic', { cost: 2 }))).toBe(true)
    const op = planner.operations.value[0]!
    planner.edit(op)
    expect(planner.draft.value!.effectCost).toBe(2)
    planner.draft.value!.customName = 'First payment'
    expect(planner.submit()).toBe(true)
    expect(planner.duplicateCharacterEffect(op.id)).toBe(true)
    const copy = planner.operations.value[1]!
    expect(copy.id).not.toBe(op.id)
    expect(copy).toMatchObject({ phase: 'postAction', cost: 2, sourceParticipantId: 'lunae' })
    expect(planner.document.value.metadata.customNames[copy.id]).toBe('First payment')
    planner.edit(copy)
    planner.draft.value!.effectCost = 3
    expect(planner.submit()).toBe(true)
    expect(
      planner.result.value.characterEffectOutcomes.map((entry) => entry.payment?.nominalCost),
    ).toEqual([2, 3])

    const serialized = serializePlannerDocument(planner.document.value)
    expect(JSON.parse(serialized).version).toBe(PLANNER_VERSION)
    expect(() =>
      parsePlannerDocument(JSON.stringify({ ...JSON.parse(serialized), version: 11 })),
    ).toThrow('structure')
    let saved: string | null = null
    const persistence = () =>
      createPlannerPersistence(() => ({
        getItem: () => saved,
        setItem: (_key, value) => {
          saved = value
        },
      }))
    const store = persistence()
    store.initialize()
    expect(store.save(parsePlannerDocument(serialized).document)).toBe(true)
    const reopened = preparePlannerDocument(persistence().initialize().document)
    expect(reopened.result.characterEffectOutcomes).toEqual(
      planner.result.value.characterEffectOutcomes,
    )

    const actors = doc.plan.actors.map((entry) =>
      entry.id === 'lunae' ? actor('new-lunae', 1) : entry,
    )
    const { ally } = doc.metadata.characterIds
    expect(
      planner.applySetup(actors, doc.plan.maxNodes, doc.plan.maxAV, {
        ally: ally!,
        'new-lunae': '1213',
      }),
    ).toBe(true)
    expect(planner.unreached.value[0]?.operations).toContainEqual(
      expect.objectContaining({ sourceParticipantId: 'lunae' }),
    )
    expect(planner.result.value.characterEffectOutcomes).toEqual([])
  })
})
