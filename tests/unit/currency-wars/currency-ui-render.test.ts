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
import { lineupSignature } from '../../../src/tools/currency-wars/signature'
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

  it('switches the entire candidate, resets details and keeps active trait members initially collapsed', async () => {
    const data = loadPageData()
    const selectedIndex = ref(0)
    const roles = data.snapshot.roles
      .filter(
        (role) =>
          !role.expert &&
          !role.mechanic &&
          role.innateTraits.some((id) =>
            data.snapshot.traits.some((trait) => trait.id === id && trait.thresholds[0] === 1),
          ),
      )
      .slice(0, 2)
    const request = {
      slots: 13,
      emblemBudget: 18,
      timeLimitSeconds: 60,
      includeExperts: false,
      tasks: data.tasks,
    }
    const solutions = roles.map((role, index) => {
      const emblem = data.snapshot.emblems.find(
        (emblem) => !role.innateTraits.includes(emblem.traitId),
      )!
      const lineup = { members: [{ formId: role.id, emblemIds: index ? [emblem.id] : [] }] }
      return {
        id: `solution-${index}`,
        lineup,
        signature: lineupSignature(lineup),
        evaluation: evaluateLineup(data.snapshot, request, lineup),
        solverStatus: 'timeLimit',
        originalOptimal: false,
        subproblemOptimal: false,
        elapsedSeconds: 1,
        foundAtSeconds: 1,
      }
    })
    const attempt: SolvedAttempt = {
      requestId: 1,
      request,
      result: {
        request,
        status: 'feasible',
        solutions,
        termination: 'budget',
        stages: [],
        totalElapsedSeconds: 60,
        maximumCompletedProven: false,
        minimumEmblemsProven: false,
      },
    }
    const nodes = mount(
      defineComponent(
        () => () =>
          h(CurrencyResults, {
            snapshot: data.snapshot,
            catalog: data.visuals,
            crafts: data.crafts,
            attempt,
            selectedIndex: selectedIndex.value,
            stale: false,
            historical: false,
            onSelect: (index: number) => (selectedIndex.value = index),
          }),
      ),
      'en',
    )
    const portrait = () => nodes().find((entry) => entry.props['aria-haspopup'] === 'dialog')!
    expect(portrait().props['aria-label']).toContain(roles[0]!.name)
    click(portrait())
    await flush()
    expect(nodes().some((entry) => entry.props.role === 'dialog')).toBe(true)
    click(nodes().find((entry) => entry.props.id === 'currency-candidates-tab-1')!)
    await flush()
    expect(nodes().some((entry) => entry.props.role === 'dialog')).toBe(false)
    expect(portrait().props['aria-label']).toContain(roles[1]!.name)
    const renderedText = nodes()
      .map((entry) => entry.text)
      .join(' ')
    expect(renderedText).toContain('Emblems used 1 / 18')
    expect(nodes().find((entry) => entry.props.id === 'currency-active-heading')).toBeDefined()
    expect(
      nodes().filter(
        (entry) =>
          entry.type === 'details' && String(entry.props.class).includes('currency-trait-members'),
      ).length,
    ).toBeGreaterThan(0)
    expect(
      nodes()
        .filter(
          (entry) =>
            entry.type === 'details' &&
            String(entry.props.class).includes('currency-trait-members'),
        )
        .every((entry) => !entry.props.open),
    ).toBe(true)
    expect(renderedText).not.toContain('Optimality gap')
    expect(nodes().some((entry) => entry.props['data-currency-kind'] === 'trait')).toBe(true)
  })

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
