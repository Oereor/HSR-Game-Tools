import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, effectScope, h, nextTick, ref, type App, type EffectScope } from 'vue'
import { createI18n } from 'vue-i18n'
import {
  renderer,
  node,
  descendants,
  type HostNode,
} from '../../fixtures/warp-simulator/node-renderer'
import WarpResults from '../../../src/tools/warp-simulator/components/WarpResults.vue'
import { useWarpReveal } from '../../../src/tools/warp-simulator/composables/useWarpReveal'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { warpVisualDefinitions } from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
} from '../../fixtures/warp-simulator/result-display'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

vi.mock('primevue/button', () => ({
  default: defineComponent({
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.())
    },
  }),
}))
const apps: App[] = [],
  scopes: EffectScope[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  scopes.splice(0).forEach((scope) => scope.stop())
})
const adapter = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  '/',
  warpVisualDefinitions,
)
const cls = (root: HostNode, name: string) =>
  descendants(root).filter((n) => String(n.props.class).split(' ').includes(name))
async function flush() {
  await nextTick()
  await nextTick()
}

describe('Homepage results with the unified production card', () => {
  it('publishes the flat ten-pull after closing, then replaces it with the same card for a single pull', async () => {
    const scope = effectScope()
    scopes.push(scope)
    const reveal = scope.run(() => useWarpReveal(ref(true)))!
    const root = node('root'),
      details = vi.fn()
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } })
    const app = renderer.createApp({
      render: () =>
        h(WarpResults, {
          entries: reveal.displayedEntries.value,
          presentation: adapter,
          sourceLabel: 'Fixture banner',
          onDetails: details,
        }),
    })
    app.use(i18n)
    app.directive('tooltip', {})
    app.mount(root)
    apps.push(app)
    expect(cls(root, 'warp-results-empty')).toHaveLength(1)
    const ten = resultDisplayScenarios().find((s) => s.id === 'four-mixed')!.entries
    expect(reveal.beginBatch(ten[0]!.batchId, ten)).toBe(true)
    expect(reveal.phase.value).toBe('overview')
    await flush()
    expect(cls(root, 'warp-result-card')).toHaveLength(0)
    reveal.escape()
    expect(reveal.afterHide(ten[0]!.batchId)).toBe(true)
    await flush()
    expect(cls(root, 'warp-wall-flat')).toHaveLength(1)
    expect(cls(root, 'warp-result-card').map((n) => n.props.id)).toEqual(
      ten.map((e) => `warp-result-${e.id}`),
    )
    expect(cls(root, 'warp-wall-row').map((row) => cls(row, 'warp-result-card').length)).toEqual([
      3, 4, 3,
    ])
    expect(cls(root, 'warp-results')[0]!.props.onClick).toBeUndefined()
    const avatar = ten.find((e) => adapter.item(e.event.itemId, 'zh-CN').kind === 'avatar')!
    const avatarItem = adapter.item(avatar.event.itemId, 'zh-CN')
    expect(
      descendants(root).some(
        (n) => n.type === 'img' && n.props.src === avatarItem.resultPortrait!.url,
      ),
    ).toBe(true)
    expect(cls(root, 'warp-character-metadata').length).toBeGreaterThan(0)
    expect(cls(root, 'warp-cone-card').length).toBeGreaterThan(0)
    ;(cls(root, 'warp-result-card')[0]!.props.onClick as () => void)()
    expect(details).toHaveBeenCalledWith(ten[0])
    const single = resultDisplayScenarios().find((s) => s.id === 'single-avatar-4')!.entries
    expect(reveal.beginBatch(single[0]!.batchId, single)).toBe(true)
    expect(reveal.displayedEntries.value).toEqual(ten)
    reveal.markArtworkReady(single[0]!.batchId, single[0]!.id)
    reveal.activate()
    expect(reveal.afterHide(single[0]!.batchId)).toBe(true)
    await flush()
    expect(cls(root, 'warp-wall-flat')).toHaveLength(0)
    expect(cls(root, 'warp-single-result')).toHaveLength(1)
    expect(cls(root, 'warp-result-card')).toHaveLength(1)
    expect(cls(root, 'warp-result-card')[0]!.props.id).toBe(`warp-result-${single[0]!.id}`)
    expect(cls(root, 'warp-character-metadata')).toHaveLength(1)
    const image = descendants(root).find(
      (n) =>
        n.type === 'img' &&
        n.props.src === adapter.item(single[0]!.event.itemId, 'zh-CN').resultPortrait!.url,
    )!
    expect(image).toBeDefined()
    i18n.global.locale.value = 'en'
    await flush()
    expect(descendants(root).find((n) => n.type === 'img' && n.props.src === image.props.src)).toBe(
      image,
    )
    expect(cls(root, 'warp-result-card')[0]!.props['aria-label']).toContain(
      adapter.item(single[0]!.event.itemId, 'en').name,
    )
    ;(cls(root, 'warp-result-card')[0]!.props.onClick as () => void)()
    expect(details).toHaveBeenLastCalledWith(single[0])
    reveal.reset()
    await flush()
    expect(cls(root, 'warp-results-empty')).toHaveLength(1)
    expect(cls(root, 'warp-result-card')).toHaveLength(0)
  })
})
