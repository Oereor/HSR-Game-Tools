import { ordinaryNode } from '../../fixtures/action-planner/ordinary-node'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computed, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import { validateMessages } from '../../../scripts/validate-i18n'
import { gameData } from '../../../src/tools/action-planner/data/adapters/game-data'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { usePlannerPresentation } from '../../../src/tools/action-planner/composables/usePlannerPresentation'
import { operationMetadata } from '../../../src/tools/action-planner/model/metadata'
import { actionDirections, nodeCamp } from '../../../src/tools/action-planner/model/naming'
import {
  formatAV,
  formatCharacterSkillPointChanges,
  formatNumber,
  operationName,
  renderMessage,
} from '../../../src/tools/action-planner/model/presentation'
import { createInitialState, simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import type {
  EffectOperation,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'
import type { ToolLocale } from '../../../src/locales/types'

const makeI18n = () =>
  createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: false,
    messages: { 'zh-CN': zhCN, en },
  })
const target = { kind: 'participants' as const, participantIds: ['b'] }
const advance: EffectOperation = { id: 'pull', type: 'advance', target, percent: 50 }
const plan = (): SimulationPlan => ({
  cycleMode: 'none',
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors: ['a', 'b'].map((id, position) => ({
    id,
    position,
    kind: 'actor',
    camp: 'ally',
    name: id,
    baseSpeed: 100,
    panelSpeed: 100,
  })),
  events: [{ anchor: { kind: 'start' }, operations: [advance] }],
  maxNodes: 4,
  maxAV: 600,
})

describe('site messages and semantic presentation', () => {
  it('resolves static translation references in the operation editor in both locales', () => {
    const source = readFileSync(
      new URL('../../../src/tools/action-planner/components/OperationEditor.vue', import.meta.url),
      'utf8',
    )
    const keys = new Set(
      [...source.matchAll(/\bt\(\s*(['"])([^'"]+)\1/g)].map((match) => match[2]!),
    )
    expect(keys.size).toBeGreaterThan(0)
    const { global: composer } = makeI18n()
    for (const locale of ['zh-CN', 'en'] as ToolLocale[])
      for (const key of keys) expect(composer.te(key, locale), `${locale}: ${key}`).toBe(true)
  })

  it('validates message structure, syntax and matching interpolation parameters', () => {
    const good = '{"message":"Hello {name}"}'
    expect(validateMessages({ 'zh-CN': good, en: good })).toEqual([])
    for (const bad of [
      '{"message":""}',
      '{"other":"Hello"}',
      '{"message":"{other}"}',
      '{"message":"{"}',
      '{"message":5}',
      '{"message":{ "name":"Hello"}}',
      '{"message":"Hello", "message":"Hello {name}"}',
      '{"message":"Hello",}',
    ])
      expect(validateMessages({ 'zh-CN': good, en: bad }).length).toBeGreaterThan(0)
    // Literal braces are not interpolation parameters; use the compiler AST.
    expect(
      validateMessages({ 'zh-CN': '{"message":"{\'name\'}"}', en: '{"message":"Name"}' }),
    ).toEqual([])
  })

  it('interpolates representative messages and preserves custom names independently of locale', () => {
    const { global: composer } = makeI18n()
    const state = createInitialState(plan())
    for (const locale of ['zh-CN', 'en'] as ToolLocale[]) {
      composer.locale.value = locale
      const title = operationName(advance, locale, composer.t, (id) => id, state)
      expect(title).toContain('b')
      expect(title).toContain('50')
      expect(title).not.toMatch(/\{|planner\./)
      expect(operationName(advance, locale, composer.t, (id) => id, state, ' My own name ')).toBe(
        'My own name',
      )
      expect(operationName(advance, locale, composer.t, (id) => id, state, ' ')).toBe(title)
      expect(formatAV(1000 / 3, locale)).toBe(
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(1000 / 3),
      )
      expect(formatNumber(1000.125, locale, true)).toBe(
        new Intl.NumberFormat(locale, {
          maximumFractionDigits: 6,
          signDisplay: 'exceptZero',
        }).format(1000.125),
      )
    }
  })

  it('keeps product entry names consistent and includes the page and site in document titles', () => {
    const { global: composer } = makeI18n()
    for (const locale of ['zh-CN', 'en'] as ToolLocale[]) {
      composer.locale.value = locale
      expect(composer.t('home.tools.actionOrder.title')).toBe(composer.t('planner.title'))
      for (const key of ['home.title', 'planner.title']) {
        const page = composer.t(key)
        const site = composer.t('site.name')
        const title = composer.t('site.pageTitle', { page, site })
        expect(title).toContain(page)
        expect(title).toContain(site)
      }
    }
  })

  it('uses localized defaults for signed skill point amounts and preserves custom names', () => {
    const { global: composer } = makeI18n()
    for (const locale of ['zh-CN', 'en'] as const) {
      composer.locale.value = locale
      for (const [amount, key] of [
        [1, 'recoverSkillPoints'],
        [-1, 'spendSkillPoints'],
        [0, 'unchangedSkillPoints'],
      ] as const) {
        const change = { id: 'skill-points', type: 'changeSkillPoints', amount } as const
        expect(operationName(change, locale, composer.t, (id) => id)).toBe(
          composer.t(`planner.operationName.${key}`),
        )
        expect(operationName(change, locale, composer.t, (id) => id, undefined, '自定义 SP')).toBe(
          '自定义 SP',
        )
      }
    }
  })

  it.each(['zh-CN', 'en'] as const)('formats settled character SP changes in %s', (locale) => {
    const { global: composer } = makeI18n()
    composer.locale.value = locale
    const { t } = composer
    const source = { operationId: 'effect', sourceParticipantId: 'actor' }
    const transition = (label: string, before: number | bigint, after: number | bigint) =>
      t('planner.characterEffects.resourceChange', {
        resource: t(label),
        before: formatNumber(before, locale),
        after: formatNumber(after, locale),
      })
    const delta = (amount: bigint) =>
      t('planner.sp.delta', { amount: formatNumber(amount, locale, true) })
    const debt = -(2n ** 54n)
    const lunae = formatCharacterSkillPointChanges(
      {
        ...source,
        effectId: 'imbibitorLunae.enhancedBasic',
        resource: { kind: 'squama', before: 1, after: 0 },
        skillPoints: { before: debt, after: debt - 2n },
        payment: { nominalCost: 3, substituteUsed: 1, actualSpCost: 2 },
      },
      locale,
      t,
    )
    expect(lunae).toEqual({
      resource: transition('planner.characterEffects.resource.squama', 1, 0),
      delta: delta(-2n),
      balance: transition('planner.sp.setup', debt, debt - 2n),
      toneAmount: -2n,
      tooltip: t('planner.characterEffects.payment', {
        nominal: '3',
        substitute: '1',
        resource: t('planner.characterEffects.resource.squama'),
      }),
    })
    expect(
      formatCharacterSkillPointChanges(
        {
          ...source,
          effectId: 'archer.followUp',
          charge: { before: 2, after: 1 },
          skillPoints: { before: 7n, after: 7n },
        },
        locale,
        t,
      ),
    ).toMatchObject({
      resource: transition('planner.characterEffects.resource.charge', 2, 1),
      delta: undefined,
      balance: undefined,
      toneAmount: -1,
    })
    const sparkle = {
      ...source,
      effectId: 'sparkle.ultimate',
      resource: { kind: 'storedSP', before: 10, after: 10 },
    } as const
    expect(
      formatCharacterSkillPointChanges(
        { ...sparkle, skillPoints: { before: 6n, after: 10n }, wastedSkillPoints: 2 },
        locale,
        t,
      ),
    ).toMatchObject({
      resource: undefined,
      delta: delta(4n),
      balance: transition('planner.sp.setup', 6n, 10n),
      tooltip: t('planner.characterEffects.sparkleWaste', { amount: '2' }),
    })
    expect(
      formatCharacterSkillPointChanges(
        { ...sparkle, skillPoints: { before: 10n, after: 10n } },
        locale,
        t,
      ),
    ).toEqual({
      resource: undefined,
      delta: undefined,
      balance: undefined,
      toneAmount: 0,
      tooltip: undefined,
    })
    expect(
      formatCharacterSkillPointChanges(
        {
          sourceParticipantId: 'actor',
          storedSP: { before: 2, after: 0 },
          skillPoints: { before: 9n, after: 11n },
        },
        locale,
        t,
      ),
    ).toMatchObject({
      resource: transition('planner.characterEffects.storedSPShort', 2, 0),
      delta: delta(2n),
      balance: transition('planner.sp.setup', 9n, 11n),
    })
  })

  it('updates localized names, metadata and errors without changing the plan, draft or simulation', async () => {
    const { global: composer } = makeI18n()
    const character = gameData.characters.find((c) => c.names['zh-CN'] !== c.names.en)!
    const planner = useActionPlanner(plan(), { customNames: {}, characterIds: { b: character.id } })
    const presentation = usePlannerPresentation(planner.document, composer.locale, composer.t)
    const execution = planner.operationContext(advance)
    const automatic = computed(() => presentation.title(advance, planner.operationContext(advance)))
    const anchor = computed(() =>
      presentation.anchorLabel({ kind: 'action', participantId: 'b', turn: 1 }),
    )
    const metadata = computed(() =>
      renderMessage(
        operationMetadata(advance, presentation.label, planner.context.value).fields[0]!.message,
        composer.locale.value as ToolLocale,
        composer.t,
      ),
    )
    const error = computed(() => composer.t('ui.nonnegative'))
    planner.edit()
    planner.draft.value!.customName = '完全燃烧'
    const before = {
      plan: planner.plan.value,
      document: planner.document.value,
      result: planner.result.value,
      draft: planner.draft.value,
    }
    const zh = [automatic.value, anchor.value, metadata.value, error.value]
    expect(presentation.label('b')).toBe(character.names['zh-CN'])
    composer.locale.value = 'en'
    await nextTick()
    expect(presentation.label('b')).toBe(character.names.en)
    for (const [i, value] of [automatic.value, anchor.value, metadata.value, error.value].entries())
      expect(value).not.toBe(zh[i])
    expect(planner.plan.value).toBe(before.plan)
    expect(planner.document.value).toBe(before.document)
    expect(planner.result.value).toBe(before.result)
    expect(planner.operationContext(advance)).toBe(execution)
    expect(planner.draft.value).toBe(before.draft)
    expect(planner.draft.value!.customName).toBe('完全燃烧')
    expect(presentation.label('a')).toBe('a')
  })

  it('keeps structured configuration visible and resolves actual execution targets', () => {
    const state = createInitialState(plan())
    const name = (id: string) => id
    expect(operationMetadata(advance, name, state)).toMatchObject({
      targetIds: ['b'],
      fields: [
        { kind: 'effect', message: { key: 'planner.metadata.advance', params: { percent: 50 } } },
      ],
    })
    const immediate: EffectOperation = { id: 'now', type: 'immediatelyAct', target }
    expect(operationMetadata(immediate, name, state).fields).toEqual([
      { kind: 'effect', message: { key: 'planner.metadata.immediatelyAct', params: undefined } },
    ])
    const speed: EffectOperation = {
      id: 'speed',
      type: 'addSpeedModifier',
      target,
      mode: 'flat',
      amount: 60,
      duration: { kind: 'countdown', name: '完全燃烧', speed: 70 },
    }
    expect(operationMetadata(speed, name, state).fields.map((f) => f.message)).toEqual([
      { key: 'planner.metadata.flat', params: { amount: { value: 60, signed: true } } },
      { key: 'planner.metadata.countdown', params: { name: '完全燃烧' } },
      { key: 'planner.metadata.speed', params: { speed: 70 } },
    ])
    for (const turns of [null, 2])
      expect(
        operationMetadata({ ...speed, duration: { kind: 'turns', turns } }, name, state).fields[1]!
          .message,
      ).toMatchObject({
        key: turns === null ? 'planner.metadata.unlimitedDuration' : 'planner.metadata.duration',
      })
    const actor: EffectOperation = {
      id: 'actor',
      type: 'spawnParticipant',
      participant: {
        kind: 'actor',
        name: 'Custom',
        camp: 'enemy',
        category: 'enemy',
        baseSpeed: 90,
        panelSpeed: 120,
        actionLimit: 2,
      },
    }
    expect(operationMetadata(actor, name).fields.map((f) => f.kind)).toEqual([
      'identity',
      'camp',
      'category',
      'speed',
      'speed',
      'actions',
    ])
    expect(
      operationMetadata(
        {
          id: 'event',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Event', speed: 70 },
        },
        name,
      ).fields.map((f) => f.kind),
    ).toEqual(['identity', 'speed', 'duration'])
    const active = { ...state, activeParticipantId: 'a' }
    const group: EffectOperation = { ...advance, target: { kind: 'allies' } }
    expect(operationMetadata(group, name, active).targetIds).toEqual(['b'])
    expect(operationMetadata(group, name).targetIds).toBeUndefined()
  })

  it('shows all three legal effects including no-op values and uses neutral unknown camps', () => {
    const input = plan()
    input.events[0]!.operations = [
      { ...advance, percent: 0 },
      { ...advance, id: 'delay', type: 'delay', percent: 0 },
      { id: 'immediate', type: 'immediatelyAct', target },
    ]
    const result = simulatePlan(input)
    const record = result.records[0]!
    expect(ordinaryNode(record).id).toBe('b')
    expect(actionDirections(record.anchor, record.actionChanges)).toEqual({
      advance: true,
      delay: true,
      immediatelyAct: true,
    })
    expect(actionDirections({ kind: 'start' }, record.actionChanges)).toEqual({
      advance: false,
      delay: false,
      immediatelyAct: false,
    })
    expect(
      actionDirections(
        result.snapshots[0]!.queue[0]!.anchor,
        result.snapshots[0]!.queue[0]!.actionChanges,
      ),
    ).toEqual({ advance: true, delay: true, immediatelyAct: true })
    expect(nodeCamp({ kind: 'actor', camp: 'ally' })).toBe('ally')
    expect(nodeCamp({ camp: 'enemy' })).toBe('enemy')
    expect(nodeCamp({ kind: 'scheduledEvent', camp: 'ally' })).toBe('event')
    expect(nodeCamp({ camp: 'unrecognized' })).toBe('unknown')
  })
})
