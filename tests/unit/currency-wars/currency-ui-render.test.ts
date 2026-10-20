import { defineComponent, h, nextTick, ref, type Component } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import CurrencyWarsPage from '../../../src/tools/currency-wars/CurrencyWarsPage.vue'
import CurrencyResults from '../../../src/tools/currency-wars/components/CurrencyResults.vue'
import CurrencyEmblemDemand from '../../../src/tools/currency-wars/components/CurrencyEmblemDemand.vue'
import { loadPageData } from '../../../src/tools/currency-wars/ui/data'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import type { OptimizationRequest } from '../../../src/tools/currency-wars/types'
import { request as makeRequest, role, task, toy } from './helpers'
import type { SolvedAttempt } from '../../../src/tools/currency-wars/ui/session'
import type { SolveMessage, WorkerPort } from '../../../src/tools/currency-wars/browser/protocol'
import {
  node,
  renderer,
  descendants,
  type HostNode,
} from '../../fixtures/currency-wars/node-renderer'
const workers = vi.hoisted(() => [] as { messages: SolveMessage[]; terminated: boolean }[])
vi.mock('../../../src/tools/currency-wars/browser/worker-factory', () => ({
  createBrowserWorker: () => {
    const worker = {
      messages: [] as SolveMessage[],
      terminated: false,
      postMessage(message: SolveMessage) {
        this.messages.push(message)
      },
      terminate() {
        this.terminated = true
      },
    }
    workers.push(worker)
    return worker as unknown as WorkerPort
  },
}))
// Dialog's focus trap/Teleport remain PrimeVue's responsibility; do not fake browser acceptance.
vi.mock('primevue/button', () => ({
  default: defineComponent({
    setup:
      (_, { attrs, slots }) =>
      () =>
        h('button', attrs, slots.default?.()),
  }),
}))
vi.mock('primevue/dialog', () => ({
  default: defineComponent({
    props: ['visible', 'header'],
    setup:
      (props, { slots }) =>
      () =>
        props.visible
          ? h('section', { role: 'dialog' }, [
              h('h2', props.header),
              slots.default?.(),
              slots.footer?.(),
            ])
          : null,
  }),
}))
const disposals: (() => void)[] = []
beforeEach(() => {
  workers.length = 0
  vi.stubGlobal('document', { activeElement: null })
  vi.stubGlobal('Document', class {})
  vi.stubGlobal('ShadowRoot', class {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  disposals.splice(0).forEach((dispose) => dispose())
  vi.unstubAllGlobals()
})
function mount(component: Component, locale: 'zh-CN' | 'en') {
  const root = node('root')
  const app = renderer.createApp(component)
  app.use(
    createI18n({ legacy: false, locale, fallbackLocale: false, messages: { 'zh-CN': zh, en } }),
  )
  app.directive('tooltip', {})
  app.mount(root)
  disposals.push(() => app.unmount())
  return () => descendants(root)
}
const text = (entry: HostNode): string => entry.text + entry.children.map(text).join(' ')
const click = (entry: HostNode) => (entry.props.onClick as () => void)()
async function flush() {
  await nextTick()
  await nextTick()
}

describe('Currency Wars Astral UI', () => {
  it.each(['zh-CN', 'en'] as const)(
    'maps switches, preserves settings across tabs and cancels/restarts (%s)',
    async (locale) => {
      const nodes = mount(CurrencyWarsPage, locale)
      const switches = () => nodes().filter((entry) => entry.props.role === 'switch')
      expect(switches()).toHaveLength(25)
      expect(switches().every((entry) => entry.props['aria-checked'] === true)).toBe(true)
      const tasks = loadPageData().tasks
      click(switches()[0]!)
      const settingsTab = nodes().find(
        (entry) => entry.props.id === 'currency-config-tab-settings',
      )!
      click(settingsTab)
      await flush()
      const input = (id: string) => nodes().find((entry) => entry.props.id === id)!
      expect(input('currency-slots').props).toMatchObject({ min: 1, max: 13, step: 1 })
      expect(input('currency-budget').props).toMatchObject({ min: 12, max: 39, step: 1 })
      const increment = locale === 'en' ? 'Increase Emblem budget' : '增加星徽预算'
      const budgetIncrease = nodes().find((entry) => entry.props['aria-label'] === increment)!
      expect(budgetIncrease).toBeDefined()
      click(budgetIncrease)
      await flush()
      click(nodes().find((entry) => entry.props.id === 'currency-config-tab-tasks')!)
      await flush()
      expect(switches()[0]!.props['aria-checked']).toBe(false)
      expect(
        switches()
          .slice(1)
          .every((entry) => entry.props['aria-checked'] === true),
      ).toBe(true)
      const form = nodes().find((entry) => entry.type === 'form')!
      const submit = () =>
        (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} })
      submit()
      await flush()
      expect(workers[0]!.messages[0]!.request).toMatchObject({
        slots: 13,
        emblemBudget: 19,
        timeLimitSeconds: 60,
        includeExperts: false,
      })
      expect(workers[0]!.messages[0]!.request.tasks.map((task) => task.id)).toEqual(
        tasks.slice(1).map((task) => task.id),
      )
      click(
        nodes().find(
          (entry) =>
            entry.type === 'button' &&
            text(entry).includes(locale === 'en' ? 'Cancel' : zh.currencyWars.cancel),
        )!,
      )
      await flush()
      expect(workers[0]!.terminated).toBe(true)
      submit()
      await flush()
      expect(workers).toHaveLength(2)
      // Directly disabling every switch updates the real submit button.
      for (const entry of switches().filter((entry) => entry.props['aria-checked'])) click(entry)
      await flush()
      expect(
        nodes().find((entry) => entry.type === 'button' && entry.props.type === 'submit')!.props
          .disabled,
      ).toBe(true)
    },
  )

  it.each(['zh-CN', 'en'] as const)(
    'searches without changing selection and applies all/clear to all tasks (%s)',
    async (locale) => {
      const nodes = mount(CurrencyWarsPage, locale)
      const search = nodes().find((n) => n.props.id === 'currency-task-search')!
      const input = (value: string) => {
        search.listeners.input!.forEach((listener) =>
          listener({ target: Object.assign(search, { value }) }),
        )
      }
      const messages = locale === 'en' ? en.currencyWars : zh.currencyWars
      const button = (label: string) =>
        nodes().find((n) => n.type === 'button' && text(n).includes(label))!
      input('task-001')
      await flush()
      expect(nodes().filter((n) => n.props.role === 'switch')).toHaveLength(1)
      expect(workers).toHaveLength(0)
      click(button(messages.form.clear))
      await flush()
      expect(nodes().find((n) => n.props.type === 'submit')!.props.disabled).toBe(true)
      click(button(messages.form.selectAll))
      await flush()
      const form = nodes().find((n) => n.type === 'form')!
      ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} })
      expect(workers[0]!.messages[0]!.request.tasks).toHaveLength(25)
      input('no-matching-task')
      await flush()
      expect(nodes().filter((n) => n.props.role === 'switch')).toHaveLength(0)
      expect(nodes().some((n) => n.text.includes(messages.form.noMatches))).toBe(true)
    },
  )

  it.each(['zh-CN', 'en'] as const)(
    'uses one native radio group with min-roles default (%s)',
    async (locale) => {
      const nodes = mount(CurrencyWarsPage, locale)
      click(nodes().find((n) => n.props.id === 'currency-config-tab-settings')!)
      await flush()
      const radios = nodes().filter((n) => n.props.type === 'radio')
      expect(radios.map((n) => n.props.name)).toEqual(['currency-objective', 'currency-objective'])
      expect((radios[0] as unknown as { checked: boolean }).checked).toBe(true)
      radios[1]!.listeners.change!.forEach((listener) => listener({ target: radios[1] }))
      await flush()
      const form = nodes().find((n) => n.type === 'form')!
      ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} })
      expect(workers[0]!.messages[0]!.request.objective).toBe('min-emblems')
    },
  )

  it('switches three content tabs without solving and resets only for a new result', async () => {
    const data = loadPageData()
    const selected = data.snapshot.roles.find((role) => !role.expert && !role.mechanic)!
    const request: OptimizationRequest = {
      objective: 'min-roles',
      slots: 13,
      emblemBudget: 18,
      timeLimitSeconds: 60,
      includeExperts: false,
      tasks: data.tasks,
    }
    const lineup = { members: [{ formId: selected.id, emblemIds: [] }] }
    const attempt = ref<SolvedAttempt>({
      requestId: 1,
      request,
      result: {
        request,
        status: 'feasible',
        solverStatus: 'timeLimit',
        elapsedSeconds: 1,
        lineup,
        evaluation: evaluateLineup(data.snapshot, request, lineup),
      },
    })
    const nodes = mount(
      defineComponent(
        () => () =>
          h(CurrencyResults, {
            snapshot: data.snapshot,
            catalog: data.visuals,
            crafts: data.crafts,
            attempt: attempt.value,
            stale: false,
            historical: false,
          }),
      ),
      'en',
    )
    const tab = (value: string) =>
      nodes().find((n) => n.props.id === 'currency-results-tab-' + value)!
    expect(nodes().filter((n) => n.props.role === 'tab')).toHaveLength(3)
    const portrait = nodes().find((n) => n.props['aria-haspopup'] === 'dialog')!
    click(portrait)
    await flush()
    expect(nodes().some((n) => n.props.role === 'dialog')).toBe(true)
    click(tab('traits'))
    await flush()
    expect(nodes().some((n) => n.props.role === 'dialog')).toBe(false)
    const details = nodes().filter(
      (n) => n.type === 'details' && String(n.props.class).includes('currency-trait-members'),
    )
    expect(details.length).toBeGreaterThan(0)
    expect(details.every((n) => !n.props.open)).toBe(true)
    click(tab('emblems'))
    await flush()
    expect(nodes().some((n) => n.text === en.currencyWars.crafting.empty)).toBe(true)
    expect(workers).toHaveLength(0)
    attempt.value = { ...attempt.value, requestId: 2 }
    await flush()
    expect(tab('lineup').props['aria-selected']).toBe(true)
    expect(nodes().some((n) => n.props['aria-haspopup'] === 'dialog')).toBe(true)
  })

  it.each(['zh-CN', 'en'] as const)(
    'renders merged traits, badges, counts and every target threshold (%s)',
    async (locale) => {
      const snapshot = toy([role(1, [1005, 1007, 1009]), role(2, [1005]), role(3, [1005])])
      const request = makeRequest([task(1005, 2), task(1005, 4), task(1007, 7), task(2008, 2)], {
        slots: 3,
      })
      const lineup = { members: snapshot.roles.map((r) => ({ formId: r.id, emblemIds: [] })) }
      const attempt: SolvedAttempt = {
        requestId: 1,
        request,
        result: {
          request,
          status: 'feasible',
          elapsedSeconds: 1,
          lineup,
          evaluation: evaluateLineup(snapshot, request, lineup),
        },
      }
      const catalog = {
        schemaVersion: 1 as const,
        costs: Object.fromEntries(snapshot.roles.map((r) => [r.id, 1 as const])),
        portraits: {},
        emblems: {},
      }
      const nodes = mount(
        defineComponent(
          () => () =>
            h(CurrencyResults, {
              snapshot,
              catalog,
              crafts: { schemaVersion: 1, seasonId: 1, materials: [], recipes: {} },
              attempt,
              stale: false,
              historical: false,
            }),
        ),
        locale,
      )
      click(nodes().find((n) => n.props.id === 'currency-results-tab-traits')!)
      await flush()
      const rows = nodes().filter(
        (n) => n.type === 'details' && String(n.props.class).includes('currency-trait-members'),
      )
      const messages = locale === 'en' ? en.currencyWars : zh.currencyWars
      expect(rows).toHaveLength(4)
      expect(text(rows[0]!)).toContain('仙舟')
      expect(text(rows[0]!)).toContain('1 / 7')
      expect(text(rows[1]!)).toContain('0 / 2')
      expect(text(rows[2]!)).toContain('3 / 2')
      expect(text(rows[2]!)).toContain('3 / 4')
      expect(text(rows[2]!)).toContain(messages.result.completed)
      expect(text(rows[2]!)).toContain(messages.result.incomplete)
      const badges = (row: HostNode) =>
        descendants(row).filter((n) => String(n.props.class).includes('h-badge'))
      expect(badges(rows[0]!).map((n) => [text(n).trim(), n.props.class])).toEqual([
        [messages.result.targetTask, expect.stringContaining('success')],
        [messages.result.inactiveTrait, expect.stringContaining('muted')],
      ])
      expect(badges(rows[2]!)).toHaveLength(1)
      expect(badges(rows[3]!)).toHaveLength(0)
      expect(descendants(rows[0]!).some((n) => n.props.title === '角色1')).toBe(true)
    },
  )

  it('keeps alternative crafting recipes separate and invents no recipe for an uncraftable emblem', () => {
    const material = { id: 1, name: 'Material', icon: undefined }
    const nodes = mount(
      defineComponent(
        () => () =>
          h(CurrencyEmblemDemand, {
            demands: [
              {
                emblemId: 1,
                name: 'Craftable',
                count: 2,
                icon: undefined,
                recipes: [
                  { craftIds: [1], materials: [material, material] },
                  { craftIds: [2], materials: [material, material] },
                ],
              },
              { emblemId: 2, name: 'Uncraftable', count: 1, icon: undefined, recipes: [] },
            ],
          }),
      ),
      'en',
    )
    const rows = nodes().filter((entry) => entry.type === 'li')
    expect(text(rows[0]!)).toContain('or')
    expect(text(rows[1]!)).not.toContain('Material')
    expect(text(rows[1]!)).toContain('—')
  })
})
