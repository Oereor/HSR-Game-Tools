import { describe, expect, it } from 'vitest'
import { presets } from '../../../src/tools/action-planner/presets/catalog'
import { compilePreset } from '../../../src/tools/action-planner/presets/resolver'
import { collectInputs, valueResolver } from '../../../src/tools/action-planner/presets/values'
import { messageAt, validatePresets } from '../../../src/tools/action-planner/presets/validation'
import type {
  PresetDefinition,
  PresetOperation,
} from '../../../src/tools/action-planner/presets/types'
import { gameData } from '../../../src/tools/action-planner/data/adapters/game-data'
import { emptyDocument } from '../../../src/tools/action-planner/model/document-file'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import {
  countdownParticipantId,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const translate = (key: string) => messageAt(en, key) ?? key
function fixture() {
  const document = emptyDocument()
  document.plan.actors = ['a', 'b'].map((id, position) => ({
    id,
    position,
    name: id,
    kind: 'actor',
    camp: 'ally',
    baseSpeed: 100,
    panelSpeed: 100,
  }))
  return document
}
function definition(operations: PresetOperation[]): PresetDefinition {
  return {
    id: 'synthetic',
    order: 0,
    interaction: 'batch',
    i18n: { name: 'ui.add', description: 'ui.add' },
    operations,
  }
}
function compile(preset: PresetDefinition, values = {}, document = fixture()) {
  let serial = 0
  const preview = applyOperations(
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
    },
    gameData.characters,
    () => `generated-${++serial}`,
  )
}

describe('declarative preset compiler', () => {
  it.each(['vonwacq', 'eagle', 'dance'])('prefills %s without publishing the document', (id) => {
    const document = fixture(),
      planner = useActionPlanner(document.plan, document.metadata)
    planner.edit()
    const before = planner.document.value
    expect(planner.submitPreset({ id, values: {}, translate })).toBe(true)
    expect(planner.document.value).toBe(before)
    expect(planner.draft.value?.percent).toBe(id === 'vonwacq' ? 40 : id === 'eagle' ? 25 : 24)
    expect(planner.draft.value?.id).toBeUndefined()
    expect(planner.submit()).toBe(true)
  })
  it('preserves start-only eligibility and the 40% gauge calculation below 120 SPD', () => {
    const preset = presets.find((p) => p.id === 'vonwacq')!
    const document = compile(preset).document!
    expect(simulatePlan(document.plan).records[0].elapsedAV).toBe(60)
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
        gameData.characters,
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
          name: { type: 'i18n', key: 'planner.robin.eventName' },
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
      participant: { name: en.planner.robin.eventName },
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
      gameData.characters,
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
        gameData.characters,
        () => String(++count),
      ).document,
    ).toBeUndefined()
    expect(count).toBe(0)
    const resolver = valueResolver(
      presets.find((p) => p.id === 'khaslana')!,
      gameData.characters,
      translate,
    )
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
  it('avoids temporary operation and participant ID collisions during compilation and prefill', () => {
    const document = fixture()
    document.plan.actors[0].id = spawnedParticipantId('preset-probe-1')
    document.plan.events = [
      {
        anchor: { kind: 'start' },
        operations: [
          { id: 'preset-draft-1', type: 'delay', target: { kind: 'allies' }, percent: 1 },
        ],
      },
    ]
    expect(
      compile(
        definition([
          {
            type: 'spawnParticipant',
            participant: { kind: 'scheduledEvent', name: 'timer', speed: 90 },
          },
        ]),
        {},
        document,
      ).invalid,
    ).toEqual([])
    const planner = useActionPlanner(document.plan, document.metadata)
    planner.edit()
    expect(planner.submitPreset({ id: 'eagle', values: {}, translate })).toBe(true)
    expect(planner.draft.value?.type).toBe('advance')
    expect(planner.draft.value?.percent).toBe(25)
  })
  it('allows editing a prefilled equipment target during an active actor preAction', () => {
    const document = fixture(),
      planner = useActionPlanner(document.plan, document.metadata)
    planner.select({ kind: 'action', participantId: 'a', turn: 1 })
    planner.edit()
    planner.draft.value!.phase = 'preAction'
    planner.draft.value!.selectedIds = ['a']
    expect(planner.presetIssues.value.eagle).toBeUndefined()
    expect(planner.submitPreset({ id: 'eagle', values: {}, translate })).toBe(true)
    expect(planner.draft.value?.selectedIds).toEqual(['a'])
    planner.draft.value!.selectedIds = ['b']
    expect(planner.submit()).toBe(true)
  })
  it('supports a declarative self-return preset without imposing an in-field character rule', () => {
    const preset = definition([{ type: 'returnToField', target: 'self' }])
    preset.characterId = '1310'
    const document = fixture()
    document.metadata.characterIds = { a: '1310' }
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
  it('validates every auto-discovered production definition', () =>
    expect(() => validatePresets(presets, [zh, en], gameData)).not.toThrow())
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
      validatePresets([definition(operations as PresetOperation[])], [zh, en], gameData),
    ).toThrow()
  })
  it('rejects duplicate IDs, conflicting inputs and excessive operations/depth', () => {
    const preset = definition([{ type: 'delay', target: 'allies', percent: 1 }])
    expect(() => validatePresets([preset, preset], [zh, en], gameData)).toThrow()
    const conflict = definition(
      [1, 2].map((value) => ({
        type: 'delay',
        target: 'allies',
        percent: { type: 'user-input', id: 'same', value },
      })),
    )
    expect(() => validatePresets([conflict], [zh, en], gameData)).toThrow()
    expect(() =>
      validatePresets(
        [{ ...preset, operations: Array.from({ length: 129 }, () => preset.operations[0]) }],
        [zh, en],
        gameData,
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
    expect(() => validatePresets([definition(nested)], [zh, en], gameData)).toThrow()
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
          name: { type: 'i18n', key: 'planner.khaslana.eventName' },
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
      expect(() => validatePresets([preset], [zh, en], gameData)).toThrow()
    let value: import('../../../src/tools/action-planner/presets/types').Value = 1
    for (let i = 0; i < 17; i++) value = { type: 'multiply', left: value, right: 1 }
    expect(() =>
      validatePresets(
        [definition([{ type: 'delay', target: 'allies', percent: value }])],
        [zh, en],
        gameData,
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
          i18n: { label: 'ui.add', hint: 'ui.edit' },
        },
      },
      {
        type: 'delay',
        target: 'allies',
        percent: {
          type: 'user-input',
          value: 1,
          id: 'p',
          i18n: { hint: 'ui.edit', label: 'ui.add' },
        },
      },
    ])
    expect(collectInputs(preset)).toHaveLength(1)
    expect(() => validatePresets([preset], [zh, en], gameData)).not.toThrow()
  })
})
