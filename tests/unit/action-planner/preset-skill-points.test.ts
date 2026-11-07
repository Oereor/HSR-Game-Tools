import { describe, expect, it } from 'vitest'
import { gameData } from '../../../src/tools/action-planner/data/adapters/game-data'
import { createInitialState, simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import type { EffectOperation, EventAnchor } from '../../../src/tools/action-planner/engine/types'
import { referencedIds } from '../../../src/tools/action-planner/model/document-file'
import { operationDraft } from '../../../src/tools/action-planner/model/editor'
import { operationMetadata } from '../../../src/tools/action-planner/model/metadata'
import { presets } from '../../../src/tools/action-planner/presets/catalog'
import { compilePreset } from '../../../src/tools/action-planner/presets/resolver'
import type {
  PresetContext,
  PresetDefinition,
  PresetOperation,
} from '../../../src/tools/action-planner/presets/types'
import { validatePresets } from '../../../src/tools/action-planner/presets/validation'
import {
  definition,
  fixture,
  game,
  messages,
  start,
  target,
  translate,
} from '../../fixtures/action-planner/presets'

const restore = {
  type: 'restoreSkillPoints',
  amount: 1,
  source: 'Opening recovery',
  storeOverflow: true,
} satisfies PresetOperation
const refund = {
  type: 'conditionalRestore',
  amount: 1,
  source: 'Manual refund',
  sourceParticipantId: 'a',
  chance: 0.5,
  cooldownTurns: 0,
  outcome: 'proc',
} satisfies PresetOperation
const firstAction = { kind: 'action', participantId: 'a', turn: 1 } as const

function compile(
  preset: PresetDefinition,
  document = fixture(),
  anchor: EventAnchor = start,
  phase: PresetContext['phase'] = 'postAction',
) {
  const preview =
    anchor.kind === 'start'
      ? createInitialState(document.plan)
      : simulatePlan(document.plan).records[0]?.beforeEffects
  let serial = 0
  return compilePreset(
    preset,
    { document, anchor, phase, preview, translate },
    gameData.characters,
    () => `stage-a-${++serial}`,
  )
}

function production(id: string) {
  const preset = presets.find((candidate) => candidate.id === id)
  if (!preset?.characterId) throw new Error(`Expected a character preset for ${id}`)
  const document = fixture()
  document.metadata.characterIds = { a: preset.characterId }
  return { preset, document }
}

describe('target-free planner operations', () => {
  it('reserves restoration and generated identities without adding a target', () => {
    const { plan } = fixture()
    plan.events = [
      {
        anchor: start,
        operations: [
          { ...restore, id: 'opening' },
          { id: 'advance', type: 'advance', target: target('orphan-target'), percent: 10 },
          {
            id: 'timer',
            type: 'spawnParticipant',
            participant: { kind: 'scheduledEvent', name: 'Timer', speed: 100 },
          },
        ],
      },
    ]
    expect(referencedIds(plan)).toEqual(
      new Set([
        'a',
        'b',
        'aha-instant',
        'opening',
        'spawn:opening',
        'countdown:opening',
        'advance',
        'spawn:advance',
        'countdown:advance',
        'orphan-target',
        'timer',
        'spawn:timer',
        'countdown:timer',
      ]),
    )
  })

  it('reserves conditional sources independently of action anchors', () => {
    const { plan } = fixture()
    plan.events = [
      {
        anchor: firstAction,
        operations: [
          {
            ...refund,
            id: 'refund',
            phase: 'postAction',
            sourceParticipantId: 'orphan-source',
          },
        ],
      },
    ]
    expect(referencedIds(plan)).toEqual(
      new Set([
        'a',
        'b',
        'aha-instant',
        'refund',
        'spawn:refund',
        'countdown:refund',
        'orphan-source',
      ]),
    )
  })

  it.each([restore, refund])(
    'prepares $type display and draft data without target access',
    (op) => {
      const operation: EffectOperation = { ...op, id: 'effect' }
      expect(operationDraft(operation).selectedIds).toEqual([])
      expect(operationMetadata(operation, (id) => id)).toEqual({
        fields: [
          {
            kind: 'effect',
            message: { key: `planner.operationName.${op.type}`, params: { amount: 1 } },
          },
        ],
      })
    },
  )
})

describe('skill-point preset declarations', () => {
  it.each([restore, refund])('accepts a valid $type declaration', (operation) => {
    expect(() => validatePresets([definition([operation])], [messages], game)).not.toThrow()
  })

  it.each([
    ['zero amount', { ...restore, amount: 0 }],
    ['fractional amount', { ...restore, amount: 0.5 }],
    ['unsafe integer amount', { ...restore, amount: Number.MAX_SAFE_INTEGER + 1 }],
    ['blank source', { ...restore, source: ' ' }],
    ['long source', { ...restore, source: 'a'.repeat(257) }],
    ['non-boolean overflow', { ...restore, storeOverflow: 'true' }],
    ['fake target', { ...restore, target: 'allies' }],
    ['missing source', { type: restore.type, amount: 1 }],
    ['missing source participant', { ...refund, sourceParticipantId: undefined }],
    ['blank source participant', { ...refund, sourceParticipantId: ' ' }],
    ['chance below zero', { ...refund, chance: -0.1 }],
    ['chance above one', { ...refund, chance: 1.1 }],
    ['negative cooldown', { ...refund, cooldownTurns: -1 }],
    ['fractional cooldown', { ...refund, cooldownTurns: 0.5 }],
    ['unsafe integer cooldown', { ...refund, cooldownTurns: Number.MAX_SAFE_INTEGER + 1 }],
    ['unknown outcome', { ...refund, outcome: 'random' }],
    ['conditional overflow flag', { ...refund, storeOverflow: true }],
    ['conditional skip flag', { ...refund, onEmpty: 'skip' }],
  ])('rejects a declaration with %s', (_label, operation) => {
    const preset = { ...definition([]), operations: [operation] }
    expect(() => validatePresets([preset], [messages], game)).toThrow()
  })

  it.each([restore, refund])('rejects $type at a generated trigger', (operation) => {
    const preset = definition([
      {
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'Timer', speed: 90 },
        onTrigger: [operation],
      },
    ])
    expect(() => validatePresets([preset], [messages], game)).toThrow('operation-default')
    expect(compile(preset).invalid).toEqual(['form'])
  })

  it('rejects start-only or duplicate conditional refunds', () => {
    expect(() =>
      validatePresets([definition([refund], { startOnly: true })], [messages], game),
    ).toThrow('operation-default')
    expect(() => validatePresets([definition([refund, refund])], [messages], game)).toThrow(
      'operation-default',
    )
  })

  it('compiles opening restoration and retains the overflow information', () => {
    const document = fixture()
    document.plan.skillPoints = { enabled: true, initial: 5 }
    const result = compile(definition([restore]), document)
    expect(result.invalid).toEqual([])
    expect(result.document?.plan.events[0]).toEqual({
      anchor: start,
      operations: [{ ...restore, id: result.operationIds[0] }],
    })
    const simulated = simulatePlan(result.document!.plan)
    expect(simulated.startSkillPointEvents?.[0]).toMatchObject({ restored: 0, stored: 1 })
    expect(simulated.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'sp-overflow',
        severity: 'info',
      }),
    )
  })

  it('compiles a post-action refund using the existing skill and allied action source', () => {
    const document = fixture()
    document.plan.skillPoints = { enabled: true, initial: 3 }
    document.plan.events = [{ anchor: firstAction, skill: { kind: 'skill' }, operations: [] }]
    const result = compile(definition([refund]), document, firstAction)
    expect(result.invalid).toEqual([])
    expect(result.document?.plan.events[0]).toEqual({
      anchor: firstAction,
      skill: { kind: 'skill' },
      operations: [{ ...refund, id: result.operationIds[0], phase: 'postAction' }],
    })
    expect(simulatePlan(result.document!.plan).records[0]?.conditionalRestores?.[0]).toMatchObject({
      sourceParticipantId: 'a',
      before: 2,
      after: 3,
    })
    expect(document.plan.events[0]?.operations).toEqual([])
  })

  it('rejects a conditional refund in the wrong action context', () => {
    const document = fixture()
    document.plan.events = [{ anchor: firstAction, skill: { kind: 'basic' }, operations: [] }]
    expect(compile(definition([refund]), document, firstAction).invalid).toEqual(['form'])
    document.plan.events[0]!.skill = { kind: 'skill' }
    expect(compile(definition([refund]), document).invalid).toEqual(['form'])
    expect(compile(definition([refund]), document, firstAction, 'preAction').invalid).toEqual([
      'form',
    ])
    expect(
      compile(definition([{ ...refund, sourceParticipantId: 'b' }]), document, firstAction).invalid,
    ).toEqual(['form'])
    expect(compile(definition([refund, refund]), document, firstAction).invalid).toEqual(['form'])
  })
})

describe('existing presets and skill-point plans', () => {
  it('applies Robin Summeretto Fever to a plan with both target-free operation variants', () => {
    const { preset, document } = production('robin-summeretto-fever')
    document.plan.skillPoints = { enabled: true, initial: 2 }
    const opening = { ...restore, id: 'opening' }
    const action = {
      anchor: { kind: 'action', participantId: 'b', turn: 1 },
      skill: { kind: 'skill' },
      operations: [{ ...refund, id: 'refund', phase: 'postAction', sourceParticipantId: 'b' }],
    } satisfies (typeof document.plan.events)[number]
    document.plan.events = [{ anchor: start, operations: [opening] }, action]
    const result = compile(preset, document)
    expect(result.invalid).toEqual([])
    expect(result.document?.plan.events[0]?.operations.map((op) => op.type)).toEqual([
      'restoreSkillPoints',
      'depart',
      'spawnParticipant',
      'spawnParticipant',
    ])
    expect(result.document?.plan.events[0]?.operations[0]).toEqual(opening)
    expect(result.document?.plan.events[1]).toEqual(action)
    expect(
      simulatePlan(result.document!.plan).diagnostics.filter((d) => d.severity === 'error'),
    ).toEqual([])
  })

  it.each(['robin-ultimate', 'firefly-ultimate'])(
    'preserves existing skill annotations with %s',
    (id) => {
      const { preset, document } = production(id)
      document.plan.events = [
        { anchor: firstAction, operations: [], skill: { kind: 'basic' } },
        { anchor: { ...firstAction, turn: 2 }, operations: [], skill: { kind: 'skill' } },
        {
          anchor: { ...firstAction, turn: 3 },
          operations: [],
          skill: { kind: 'custom', cost: 2, recovery: 1 },
        },
        { anchor: { ...firstAction, turn: 4 }, operations: [] },
      ]
      const result = compile(preset, document)
      expect(result.invalid).toEqual([])
      expect(result.document?.plan.events.slice(0, 4)).toEqual(document.plan.events)
      expect(Object.hasOwn(result.document!.plan.events[3]!, 'skill')).toBe(false)
      expect(
        Object.hasOwn(
          result.document!.plan.events.find((event) => event.anchor.kind === 'start')!,
          'skill',
        ),
      ).toBe(false)
    },
  )

  it('keeps action skills during the replay that prunes empty future groups', () => {
    const document = fixture()
    document.plan.skillPoints = { enabled: true, initial: 0 }
    document.plan.events = [{ anchor: firstAction, operations: [], skill: { kind: 'skill' } }]
    const preset = definition([
      {
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'Late trigger', speed: 50 },
        onTrigger: [{ type: 'advance', target: 'enemies', percent: 10, onEmpty: 'skip' }],
      },
    ])
    const result = compile(preset, document)
    expect(result.invalid).toEqual([])
    // The first action blocks payment before the trigger. Replay cannot know the future group is empty.
    expect(
      result.document?.plan.events.find((event) => event.anchor.kind === 'trigger')?.operations,
    ).toEqual([expect.objectContaining({ type: 'advance' })])
    expect(simulatePlan(result.document!.plan).blockedAction?.anchor).toEqual(firstAction)
  })

  it('accepts Robin’s departure with the original cap-loss warning', () => {
    const { preset, document } = production('robin-summeretto-fever')
    document.plan.skillPoints = {
      enabled: true,
      initial: 6,
      max: 5,
      maxModifiers: [{ sourceParticipantId: 'a', amount: 1 }],
    }
    const result = compile(preset, document)
    expect(result.invalid).toEqual([])
    const simulated = simulatePlan(result.document!.plan)
    expect(simulated.startMaxChanges).toEqual([
      expect.objectContaining({
        beforeMax: 6,
        afterMax: 5,
        before: 6,
        after: 5,
        loss: 1,
      }),
    ])
    expect(simulated.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'sp-cap-loss',
        severity: 'warning',
        operationId: result.operationIds[0],
      }),
    )
  })

  it('still rejects a genuine engine error during Robin’s departure', () => {
    const { preset, document } = production('robin-summeretto-fever')
    document.plan.skillPoints = {
      enabled: true,
      initial: 0,
      max: 0,
      maxModifiers: [{ sourceParticipantId: 'a', amount: 1 }, { amount: -1 }],
    }
    const result = compile(preset, document)
    expect(result).toMatchObject({ operationIds: [], issue: { code: 'form', operationIndex: 0 } })
    expect(result.document).toBeUndefined()
    const direct = simulatePlan({
      ...document.plan,
      events: [
        { anchor: start, operations: [{ id: 'leave', type: 'depart', target: target('a') }] },
      ],
    })
    expect(direct.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'invalid-sp-max',
        severity: 'error',
      }),
    )
  })
})
