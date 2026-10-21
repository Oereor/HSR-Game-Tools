import { defineComponent, h, nextTick, onMounted, ref, watch, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  renderer,
  node,
  descendants,
  type HostNode,
} from '../../fixtures/warp-simulator/node-renderer'
import WarpRevealOverlay from '../../../src/tools/warp-simulator/components/WarpRevealOverlay.vue'
import WarpResultCard from '../../../src/tools/warp-simulator/components/WarpResultCard.vue'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { warpVisualDefinitions } from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
} from '../../fixtures/warp-simulator/result-display'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const { focused } = vi.hoisted(() => ({ focused: [] as string[] }))
vi.mock('primevue/button', () => ({
  default: defineComponent({
    props: ['label', 'unstyled'],
    setup(props, { attrs, slots, expose }) {
      expose({ $el: { focus: () => focused.push(String(attrs['aria-label'])) } })
      return () => h('button', attrs, slots.default?.() ?? props.label)
    },
  }),
}))
vi.mock('primevue/dialog', () => ({
  default: defineComponent({
    props: ['visible'],
    emits: ['show', 'after-hide'],
    setup(props, { slots, emit }) {
      onMounted(() => {
        if (props.visible) emit('show')
      })
      watch(
        () => props.visible,
        async (visible) => {
          if (!visible) {
            await nextTick()
            emit('after-hide')
          }
        },
      )
      return () => (props.visible ? h('section', { role: 'dialog' }, slots.container?.()) : null)
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/composables/useWarpPixelRatio', () => ({
  useWarpPixelRatio: () => ref(2),
}))
// The real card is tested below; this stub isolates modal navigation from CSS layout.
vi.mock('../../../src/tools/warp-simulator/components/WarpResultsWall.vue', () => ({
  default: defineComponent({
    props: ['entries'],
    emits: ['details'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          (props.entries as { id: number }[]).map((entry) =>
            h('button', {
              id: `wall-${entry.id}`,
              onClick: () => emit('details', entry),
            }),
          ),
        )
    },
  }),
}))

const apps: App[] = []
const adapter = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  '/',
  warpVisualDefinitions,
)
const entries = resultDisplayScenarios().find((s) => s.id === 'five-mixed')!.entries
const cls = (root: HostNode, name: string) =>
  descendants(root).find((n) =>
    String(n.props.class ?? '')
      .split(/\s+/)
      .includes(name),
  )!
async function flush() {
  await nextTick()
  await nextTick()
  await nextTick()
}
function configure(app: App) {
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } }))
  app.directive('tooltip', {})
  apps.push(app)
}
beforeEach(() => {
  focused.length = 0
  vi.stubGlobal('document', { getElementById: (id: string) => ({ focus: () => focused.push(id) }) })
})
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

describe('Overview interactions in the real overlay (Node renderer, no browser focus trap)', () => {
  it('keeps ten ordered entries, ignores blank activation, and returns from details before closing the batch', async () => {
    const root = node('root'),
      escape = vi.fn(),
      activate = vi.fn()
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: true,
          phase: 'overview',
          batchId: entries[0]!.batchId,
          entries,
          presentation: adapter,
          artworkReady: false,
          identityReady: false,
          onEscape: escape,
          onActivate: activate,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    expect(focused.at(-1)).toBe('关闭结果总览')
    const cards = descendants(root).filter((n) => String(n.props.id).startsWith('wall-'))
    expect(cards.map((n) => n.props.id)).toEqual(entries.map((e) => `wall-${e.id}`))
    expect(cls(root, 'warp-reveal-screen')).toBeUndefined()
    ;(cards[0]!.props.onClick as () => void)()
    await flush()
    expect(cls(root, 'warp-overview').props.inert).toBe(true)
    expect(cls(root, 'warp-overview-detail')).toBeDefined()
    expect(focused.at(-1)).toBe('关闭物品详情')
    const tab = { key: 'Tab', repeat: false, preventDefault: vi.fn() }
    ;(cls(root, 'warp-reveal-shell').props.onKeydown as (event: unknown) => void)(tab)
    expect(tab.preventDefault).toHaveBeenCalledOnce()
    expect(focused.at(-1)).toBe('关闭物品详情')
    const event = {
      key: 'Escape',
      repeat: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    ;(cls(root, 'warp-reveal-shell').props.onKeydown as (event: unknown) => void)(event)
    await flush()
    expect(cls(root, 'warp-overview-detail')).toBeUndefined()
    expect(cls(root, 'warp-overview').props.inert).toBe(false)
    expect(focused.at(-1)).toBe(`warp-overview-result-${entries[0]!.id}`)
    expect(escape).not.toHaveBeenCalled()
    ;(cls(root, 'warp-reveal-shell').props.onKeydown as (event: unknown) => void)(event)
    expect(escape).toHaveBeenCalledOnce()
    expect(activate).not.toHaveBeenCalled()
  })
  it('uses preview artwork for single cones and preserves image readiness identities', async () => {
    const entry = resultDisplayScenarios().find((s) => s.id === 'single-light-cone-3')!.entries[0]!
    const item = adapter.item(entry.event.itemId, 'zh-CN'),
      ready = vi.fn()
    const root = node('root')
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: true,
          phase: 'artwork',
          batchId: entry.batchId,
          entry,
          item,
          artworkReady: false,
          identityReady: false,
          'onArtwork-ready': ready,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    const image = descendants(root).find(
      (n) => n.type === 'img' && n.props.src === item.lightConePreview!.url,
    )!
    expect(image.props.style).toMatchObject({ maxWidth: '174px', maxHeight: '204px' })
    ;(image.props.onError as (e: unknown) => void)({
      target: { getAttribute: () => item.lightConePreview!.url },
    })
    await flush()
    const fallback = descendants(root).find(
      (n) => n.type === 'img' && n.props.src === item.artworkUrl,
    )!
    expect(fallback).toBeDefined()
    ;(fallback.props.onError as (e: unknown) => void)({
      target: { getAttribute: () => item.artworkUrl },
    })
    await flush()
    expect(ready).toHaveBeenCalledWith(entry.batchId, entry.id)
  })
  it('emits the outgoing batch token with the modal hide callback', async () => {
    const visible = ref(true),
      hidden = vi.fn(),
      root = node('root')
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: visible.value,
          batchId: 42,
          phase: visible.value ? 'overview' : 'leaving',
          entries,
          presentation: adapter,
          artworkReady: false,
          identityReady: false,
          'onAfter-hide': hidden,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    visible.value = false
    await flush()
    expect(hidden).toHaveBeenCalledWith(42)
  })
})

describe('Real result card image sources', () => {
  it('keeps preview fallback isolated from card rotation and never substitutes a character icon', async () => {
    const root = node('root'),
      entry = entries[1]!,
      item = adapter.item(entry.event.itemId, 'zh-CN')
    const details = vi.fn()
    const app = renderer.createApp({
      render: () => h(WarpResultCard, { entry, item, index: 1, single: false, onDetails: details }),
    })
    configure(app)
    app.mount(root)
    await flush()
    expect(cls(root, 'warp-result-card').props.style).not.toHaveProperty('transform')
    const image = descendants(root).find(
      (n) => n.type === 'img' && n.props.src === item.lightConePreview!.url,
    )!
    expect(image).toBeDefined()
    ;(cls(root, 'warp-result-card').props.onClick as () => void)()
    expect(details).toHaveBeenCalledWith(entry)
  })
})
