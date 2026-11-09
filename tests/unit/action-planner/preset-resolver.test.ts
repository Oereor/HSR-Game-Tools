import { describe, expect, it } from 'vitest'
import { compilePreset } from '../../../src/tools/action-planner/presets/resolver'
import { collectInputs, valueResolver } from '../../../src/tools/action-planner/presets/values'
import { validatePresets } from '../../../src/tools/action-planner/presets/validation'
import type {
  PresetContext,
  PresetDefinition,
  PresetOperation,
} from '../../../src/tools/action-planner/presets/types'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import {
  countdownParticipantId,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import {
  fixture,
  definition,
  game,
  messages,
  translate,
  repeatPreset,
  returnPreset,
} from '../../fixtures/action-planner/presets'

function compile(
  preset: PresetDefinition,
  values = {},
  document = fixture(),
  context: Partial<PresetContext> = {},
) {
  let serial = 0
  const preview = Object.hasOwn(context, 'preview')
    ? context.preview
    : applyOperations(
        createInitialState(document.plan),
        document.plan.events.find((event) => event.anchor.kind === 'start')?.operations ?? [],
        { kind: 'start' },
      ).state
  return compilePreset(
    preset,
    {
      document,
      anchor: { kind: 'start' },
      phase: 'postAction',
      preview,
      selectedIds: ['a', 'b'],
      values,
      translate,
      ...context,
    },
    game.characters,
    () => `generated-${++serial}`,
  )
}

describe('declarative preset compiler', () => {
  it('compiles signed changes at start and in a scheduled trigger', () => {
    const preset = definition([
      { type: 'changeSkillPoints', amount: 2 },
      {
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'Test timer', speed: 100, initialAG: 100 },
        onTrigger: [{ type: 'changeSkillPoints', amount: -6 }],
      },
    ])
    const document = fixture()
    document.plan.skillPoints = { enabled: true }
    expect(() => validatePresets([preset], [messages], game)).not.toThrow()
    const compiled = compile(preset, {}, document)
    expect(compiled.invalid).toEqual([])
    const trigger = compiled.document!.plan.events.find((event) => event.anchor.kind === 'trigger')!
    expect(trigger.operations).toEqual([
      expect.objectContaining({ type: 'changeSkillPoints', amount: -6 }),
    ])
    expect(trigger.operations[0].phase).toBeUndefined()
    const result = simulatePlan(compiled.document!.plan)
    expect(result.snapshots[0].skillPoints?.current).toBe(5n)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        anchor: trigger.anchor,
        code: 'sp-negative-first',
      }),
    )
  })

  it('identifies self from metadata and checks presence at the insertion point', () => {
    const document = fixture()
    const state = createInitialState(document.plan)
    const missing = fixture()
    missing.metadata.characterIds = {}
    const ambiguous = fixture()
    ambiguous.metadata.characterIds.b = returnPreset.characterId!
    const departed = applyOperations(
      state,
      [{ id: 'leave', type: 'depart', target: { kind: 'participants', participantIds: ['a'] } }],
      { kind: 'start' },
    ).state
    const cases = [
      { document: missing, preview: state, issue: 'missing' },
      { document: ambiguous, preview: state, issue: 'ambiguous' },
      { document, preview: departed, issue: 'departed' },
      {
        document,
        preview: { ...state, participants: state.participants.filter((p) => p.id !== 'a') },
        issue: 'unavailable',
      },
      { document, preview: undefined, issue: 'context' },
    ]
    for (const { document, preview, issue } of cases) {
      expect(compile(returnPreset, {}, document, { preview }).invalid, issue).toEqual([issue])
    }
  })
  it('resolves independent catalog and self stats and rejects missing or invalid sources', () => {
    const preset = definition([
      {
        type: 'delay',
        target: 'allies',
        percent: {
          type: 'user-input',
          id: 'base',
          value: { type: 'character-stat', characterId: 'test-character', stat: 'baseSpeed' },
        },
      },
    ])
    expect(compile(preset).document!.plan.events[0]!.operations[0]).toMatchObject({ percent: 94 })
    expect(compile(preset, { base: 120 }).document!.plan.events[0]!.operations[0]).toMatchObject({
      percent: 120,
    })
    const stat = { type: 'self-stat', stat: 'panelSpeed' } as const
    expect(() => valueResolver(repeatPreset, game.characters, translate).resolve(stat)).toThrow(
      'self-stat',
    )
    expect(
      valueResolver(
        repeatPreset,
        game.characters,
        translate,
        {},
        { panelSpeed: 123.456789 },
      ).resolve(stat),
    ).toBe(123.456789)
    const document = fixture()
    const preview = createInitialState(document.plan)
    document.plan.actors[0]!.panelSpeed = NaN
    expect(compile(repeatPreset, {}, document, { preview }).invalid).toEqual(['self-stat'])
    expect(() => valueResolver(preset, [], translate)).toThrow('character-stat')
  })
  it('restricts start-only definitions to the start anchor', () => {
    const preset = definition([{ type: 'advance', target: 'allies', percent: 35 }], {
      startOnly: true,
    })
    const document = fixture()
    expect(
      compilePreset(
        preset,
        {
          document,
          anchor: { kind: 'action', participantId: 'a', turn: 1 },
          phase: 'postAction',
          preview: createInitialState(document.plan),
          translate,
        },
        game.characters,
        () => 'unused',
      ).invalid,
    ).toEqual(['startOnly'])
  })
  it.each([
    { type: 'advance', target: 'selected', percent: 10 },
    { type: 'delay', target: 'enemies', percent: 20 },
    { type: 'immediatelyAct', target: 'allies' },
    {
      type: 'addSpeedModifier',
      target: 'selected',
      mode: 'percent',
      amount: 10,
      duration: { kind: 'turns', turns: 2 },
    },
    {
      type: 'spawnParticipant',
      participant: { kind: 'actor', camp: 'ally', name: 'dynamic', baseSpeed: 80, panelSpeed: 90 },
    },
    { type: 'depart', target: 'selected' },
    { type: 'returnToField', target: 'selected' },
  ] as PresetOperation[])('resolves the $type operation', (operation) => {
    const document = fixture()
    document.plan.actors[1].camp = 'enemy'
    if (operation.type === 'returnToField')
      document.plan.events = [
        {
          anchor: { kind: 'start' },
          operations: [
            {
              id: 'leave',
              type: 'depart',
              target: { kind: 'participants', participantIds: ['a', 'b'] },
            },
          ],
        },
      ]
    const built = compile(definition([operation]), {}, document)
    expect(built.invalid).toEqual([])
    expect(built.document!.plan.events[0].operations.at(-1)!.type).toBe(operation.type)
  })
  it('collects shared inputs once and resolves string/number defaults and overrides', () => {
    const preset = definition([
      {
        type: 'addSpeedModifier',
        target: 'allies',
        mode: 'flat',
        amount: { type: 'user-input', id: 'amount', value: 12 },
        duration: { kind: 'turns', turns: null },
      },
      { type: 'delay', target: 'allies', percent: { type: 'ref', id: 'amount' } },
      {
        type: 'spawnParticipant',
        participant: {
          kind: 'scheduledEvent',
          speed: 70,
          name: { type: 'user-input', id: 'name', value: 'test' },
        },
      },
    ])
    expect(collectInputs(preset).map((i) => i.id)).toEqual(['amount', 'name'])
    const operations = compile(preset, { amount: 27, name: 'edited' }).document!.plan.events[0]
      .operations
    expect(operations[0]).toMatchObject({ amount: 27 })
    expect(operations[1]).toMatchObject({ percent: 27 })
    expect(operations[2]).toMatchObject({ participant: { name: 'edited' } })
    expect(compile(preset).document!.plan.events[0].operations[0]).toMatchObject({ amount: 12 })
    expect(compile(preset, { amount: '27' }).invalid).toEqual(['amount'])
    expect(compile(preset, { amount: NaN }).invalid).toEqual(['amount'])
    expect(compile(preset, { name: '' }).document).toBeUndefined()
  })
  it('expands nested scheduled-event and countdown IDs, fully resolving declaration fields', () => {
    const preset = definition([
      {
        type: 'spawnParticipant',
        participant: {
          kind: 'scheduledEvent',
          name: { type: 'i18n', key: 'test.event', params: { index: 2 } },
          speed: 90,
        },
        onTrigger: [
          {
            type: 'addSpeedModifier',
            target: 'allies',
            mode: 'flat',
            amount: 10,
            duration: { kind: 'countdown', name: 'expires', speed: 70 },
            onTrigger: [{ type: 'delay', target: 'allies', percent: 1 }],
          },
        ],
      },
    ])
    const built = compile(preset),
      events = built.document!.plan.events
    expect(events[0].operations[0]).toMatchObject({
      participant: { name: 'Event 2' },
    })
    expect(events[1].anchor).toEqual({
      kind: 'trigger',
      participantId: spawnedParticipantId(events[0].operations[0].id),
    })
    expect(events[2].anchor).toEqual({
      kind: 'trigger',
      participantId: countdownParticipantId(events[1].operations[0].id),
    })
    expect(JSON.stringify(events)).not.toMatch(/onTrigger|i18n|user-input/)
    expect(simulatePlan(built.document!.plan).diagnostics).toEqual([])
  })
  it('keeps the departed snapshot when another ally spawns before return', () => {
    const preset = definition([
      { type: 'depart', target: { snapshot: 'team' } },
      {
        type: 'spawnParticipant',
        participant: {
          kind: 'actor',
          camp: 'ally',
          name: 'new ally',
          baseSpeed: 100,
          panelSpeed: 100,
        },
      },
      {
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'return', speed: 90 },
        onTrigger: [{ type: 'returnToField', target: { snapshot: 'team' } }],
      },
    ])
    preset.snapshots = { team: { target: 'allies', operation: 'depart' } }
    const built = compile(preset)
    expect(built.document!.plan.events[1].operations[0]).toMatchObject({
      target: { kind: 'participants', participantIds: ['a', 'b'] },
    })
    expect(simulatePlan(built.document!.plan).diagnostics).toEqual([])
  })
  it('keeps an existing trigger insertion anchor', () => {
    const document = fixture(),
      anchor = { kind: 'trigger', participantId: 'external-event' } as const
    const result = compilePreset(
      definition([{ type: 'delay', target: 'allies', percent: 1 }]),
      {
        document,
        anchor,
        phase: 'postAction',
        preview: createInitialState(document.plan),
        translate,
      },
      game.characters,
      () => 'new',
    )
    expect(result.document!.plan.events[0].anchor).toEqual(anchor)
  })
  it('evaluates arithmetic in declared order and rejects division by zero before ID allocation', () => {
    const preset = definition([
      { type: 'delay', target: 'allies', percent: { type: 'divide', left: 1, right: 0 } },
    ])
    let count = 0
    const document = fixture()
    expect(
      compilePreset(
        preset,
        {
          document,
          anchor: { kind: 'start' },
          phase: 'postAction',
          preview: createInitialState(document.plan),
          translate,
        },
        game.characters,
        () => String(++count),
      ).document,
    ).toBeUndefined()
    expect(count).toBe(0)
    const resolver = valueResolver(definition([]), game.characters, translate)
    expect(
      resolver.resolve({
        type: 'multiply',
        left: 94,
        right: { type: 'divide', left: 67.5, right: 100 },
      }),
    ).toBe(94 * (67.5 / 100))
  })
  it('reports a string input error against its actual field', () => {
    const preset = definition([
      {
        type: 'spawnParticipant',
        participant: {
          kind: 'scheduledEvent',
          speed: 70,
          name: { type: 'user-input', id: 'eventName', value: 'event' },
        },
      },
    ])
    expect(compile(preset, { eventName: '  ' }).issue).toEqual({
      code: 'eventName',
      field: 'eventName',
      operationIndex: 0,
    })
  })
  it('omits an empty future countdown and its complete trigger subtree', () => {
    const preset = definition([
      { type: 'depart', target: 'allies' },
      {
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'event', speed: 90 },
        onTrigger: [
          {
            type: 'addSpeedModifier',
            target: 'allies',
            onEmpty: 'skip',
            mode: 'flat',
            amount: 10,
            duration: { kind: 'countdown', name: 'empty', speed: 70 },
            onTrigger: [{ type: 'delay', target: 'allies', percent: 1 }],
          },
        ],
      },
    ])
    const built = compile(preset)
    expect(built.invalid).toEqual([])
    expect(built.operationIds).toHaveLength(2)
    expect(simulatePlan(built.document!.plan).diagnostics).toEqual([])
    expect(built.document!.plan.events).toHaveLength(2)
  })
  it('skips empty dynamic groups without hiding invalid explicit targets', () => {
    const preset = definition([
      { type: 'depart', target: 'allies' },
      { type: 'immediatelyAct', target: 'allies', onEmpty: 'skip' },
    ])
    expect(compile(preset).document!.plan.events[0]!.operations.map((op) => op.type)).toEqual([
      'depart',
    ])
    preset.operations[1]!.target = 'selected'
    expect(compile(preset).document).toBeUndefined()
  })
  it('supports a declarative self-return preset without imposing an in-field character rule', () => {
    const preset = definition([{ type: 'returnToField', target: 'self' }])
    preset.characterId = 'test-character'
    const document = fixture()
    document.metadata.characterIds = { a: 'test-character' }
    document.plan.events = [
      {
        anchor: { kind: 'start' },
        operations: [
          { id: 'depart', type: 'depart', target: { kind: 'participants', participantIds: ['a'] } },
        ],
      },
    ]
    expect(compile(preset, {}, document).invalid).toEqual([])
    preset.selfPresence = 'present'
    expect(compile(preset, {}, document).invalid).toEqual(['departed'])
  })
})

describe('preset static validation', () => {
  it('accepts synthetic declarations and requires a valid self-stat shape and identity', () => {
    expect(() =>
      validatePresets([repeatPreset, returnPreset], [messages, messages], game),
    ).not.toThrow()
    for (const value of [
      { type: 'self-stat', stat: 'baseSpeed' },
      { type: 'self-stat', stat: 'panelSpeed', extra: true },
    ]) {
      expect(() =>
        validatePresets(
          [
            definition([{ type: 'delay', target: 'allies', percent: value } as PresetOperation], {
              characterId: 'test-character',
            }),
          ],
          [messages, messages],
          game,
        ),
      ).toThrow()
    }
    const preset = definition([
      { type: 'delay', target: 'allies', percent: { type: 'self-stat', stat: 'panelSpeed' } },
    ])
    expect(() => validatePresets([preset], [messages, messages], game)).toThrow('self-reference')
  })
  it.each(
    [
      [{ type: 'unknown', target: 'allies' }],
      [{ type: 'advance', target: 'allies', percent: 10, extra: true }],
      [{ type: 'delay', target: 'self', percent: 1 }],
      [{ type: 'advance', target: { snapshot: 'missing' }, percent: 10 }],
      [{ type: 'delay', target: 'allies', percent: { type: 'ref', id: 'missing' } }],
      [
        {
          type: 'spawnParticipant',
          participant: {
            kind: 'actor',
            name: 'actor',
            camp: 'ally',
            baseSpeed: 100,
            panelSpeed: 100,
          },
          onTrigger: [{ type: 'delay', target: 'allies', percent: 1 }],
        },
      ],
      [
        {
          type: 'addSpeedModifier',
          target: 'allies',
          mode: 'flat',
          amount: 1,
          duration: { kind: 'turns', turns: null },
          onTrigger: [{ type: 'delay', target: 'allies', percent: 1 }],
        },
      ],
      [
        {
          type: 'spawnParticipant',
          participant: {
            kind: 'scheduledEvent',
            speed: 70,
            name: { type: 'i18n', key: 'missing.key' },
          },
        },
      ],
    ].map((operations) => [operations]),
  )('rejects malformed or unsupported declarations %#', (operations) => {
    expect(() =>
      validatePresets([definition(operations as PresetOperation[])], [messages, messages], game),
    ).toThrow()
  })
  it('rejects duplicate IDs, conflicting inputs and excessive operations/depth', () => {
    const preset = definition([{ type: 'delay', target: 'allies', percent: 1 }])
    expect(() => validatePresets([preset, preset], [messages, messages], game)).toThrow()
    const conflict = definition(
      [1, 2].map((value) => ({
        type: 'delay',
        target: 'allies',
        percent: { type: 'user-input', id: 'same', value },
      })),
    )
    expect(() => validatePresets([conflict], [messages, messages], game)).toThrow()
    expect(() =>
      validatePresets(
        [{ ...preset, operations: Array.from({ length: 129 }, () => preset.operations[0]) }],
        [messages, messages],
        game,
      ),
    ).toThrow()
    let nested = preset.operations
    for (let i = 0; i < 5; i++)
      nested = [
        {
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'nested', speed: 90 },
          onTrigger: nested,
        },
      ]
    expect(() => validatePresets([definition(nested)], [messages, messages], game)).toThrow()
    expect(compile(definition(nested)).invalid).toEqual(['depth'])
  })
  it('checks default operation semantics, interpolation arguments and input/value limits', () => {
    const invalidSpeed = definition([
      {
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'timer', speed: -1 },
      },
    ])
    const invalidMessage = definition([
      {
        type: 'spawnParticipant',
        participant: {
          kind: 'scheduledEvent',
          name: { type: 'i18n', key: 'test.event' },
          speed: 90,
        },
      },
    ])
    const tooManyInputs = definition(
      Array.from({ length: 65 }, (_, index) => ({
        type: 'delay',
        target: 'allies',
        percent: { type: 'user-input', id: `p${index}`, value: 1 },
      })),
    )
    for (const preset of [invalidSpeed, invalidMessage, tooManyInputs])
      expect(() => validatePresets([preset], [messages, messages], game)).toThrow()
    let value: import('../../../src/tools/action-planner/presets/types').Value = 1
    for (let i = 0; i < 17; i++) value = { type: 'multiply', left: value, right: 1 }
    expect(() =>
      validatePresets(
        [definition([{ type: 'delay', target: 'allies', percent: value }])],
        [messages, messages],
        game,
      ),
    ).toThrow()
  })
  it('deduplicates equivalent repeated input declarations regardless of property order', () => {
    const preset = definition([
      {
        type: 'delay',
        target: 'allies',
        percent: {
          type: 'user-input',
          id: 'p',
          value: 1,
          i18n: { label: 'test.label', hint: 'test.title' },
        },
      },
      {
        type: 'delay',
        target: 'allies',
        percent: {
          type: 'user-input',
          value: 1,
          id: 'p',
          i18n: { hint: 'test.title', label: 'test.label' },
        },
      },
    ])
    expect(collectInputs(preset)).toHaveLength(1)
    expect(() => validatePresets([preset], [messages, messages], game)).not.toThrow()
  })
})
