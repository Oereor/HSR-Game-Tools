import { ref } from 'vue'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import manifest from '../../../src/tools/warp-simulator/data/visuals/manifest.json'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { assertVisualCatalog } from '../../../src/tools/warp-simulator/model/visual-catalog'
import catalog from '../../../src/tools/warp-simulator/data/visuals/catalog.json'
import { contrastRatio, readableColor } from '../../../src/tools/warp-simulator/model/color'
import { warpVisualTokens } from '../../../src/theme/preset'
import { useWarpOverlay } from '../../../src/tools/warp-simulator/composables/useWarpOverlay'
import { useImageSource } from '../../../src/composables/useImageSource'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { seeded } from '../../fixtures/warp-simulator/fixture'

const adapter = createPresentation(warpSnapshot, warpVisuals, '/sub/', warpVisualDefinitions)
describe('Phase 1F visual metadata and interaction isolation', () => {
  it('maps internal path IDs independently from translated names', () => {
    for (const [id, cn, en] of [
      ['Warrior', '毁灭', 'Destruction'],
      ['Knight', '存护', 'Preservation'],
      ['Priest', '丰饶', 'Abundance'],
    ]) {
      const source = warpSnapshot.items.find((item) => warpVisuals[item.id]?.path === id)!
      expect(adapter.item(source.id, 'zh-CN')).toMatchObject({ path: id, pathName: cn })
      expect(adapter.item(source.id, 'en')).toMatchObject({ path: id, pathName: en })
      expect(adapter.item(source.id, 'en').pathIconUrl).toBe(
        '/sub/' + warpVisualDefinitions.paths[id!]!.iconPath,
      )
    }
  })
  it('uses the exact original Star3/4/5 images for the matching rarities', () => {
    for (const rarity of [3, 4, 5] as const) {
      const mapping = manifest.assets.find(
        (asset) => asset.source === `icon/deco/Star${rarity}.png`,
      )!
      expect(warpVisualDefinitions.stars[rarity]).toBe(mapping.output)
      for (const item of warpSnapshot.items.filter((row) => row.rarity === rarity))
        expect(adapter.item(item.id, 'en').starsUrl).toBe('/sub/' + mapping.output)
    }
    expect(new Set(Object.values(warpVisualDefinitions.stars)).size).toBe(3)
  })
  it('localizes metadata without giving light cones an element', () => {
    expect(adapter.item('avatar:1503', 'en')).toMatchObject({
      path: 'Elation',
      pathName: 'Elation',
      element: 'Ice',
      elementName: 'Ice',
    })
    for (const source of warpSnapshot.items.filter((item) => item.kind === 'light-cone')) {
      const item = adapter.item(source.id, 'zh-CN')
      expect(item.pathIconUrl).toBeTruthy()
      expect(item.artworkUrl).toBeTruthy()
      for (const field of [
        'element',
        'elementName',
        'elementColor',
        'elementTextColor',
        'elementIconUrl',
      ] as const)
        expect(item[field]).toBeUndefined()
    }
  })
  it('preserves source colors and minimally brightens only low-contrast element text', () => {
    for (const definition of Object.values(warpVisualDefinitions.elements)) {
      expect(definition.color).toMatch(/^#[\da-f]{6}$/i)
      const color = readableColor(definition.color, warpVisualTokens.surface)!
      expect(contrastRatio(color, warpVisualTokens.surface)).toBeGreaterThanOrEqual(4.5)
      if (contrastRatio(definition.color, warpVisualTokens.surface) >= 4.5)
        expect(color).toBe(definition.color)
    }
    const quantum = warpVisualDefinitions.elements.Quantum!
    expect(quantum.color).toBe('#1C29BA')
    expect(readableColor(quantum.color, warpVisualTokens.surface)).not.toBe(quantum.color)
    expect(readableColor('red', warpVisualTokens.surface)).toBeUndefined()
    expect(readableColor('#123456', 'invalid')).toBeUndefined()
  })
  it('rejects invalid metadata and unsafe paths while allowing explicit missing artwork', () => {
    const invalid = structuredClone(catalog)
    invalid.elements.Quantum.color = 'red'
    expect(() => assertVisualCatalog(invalid, warpSnapshot)).toThrow(/color/)
    const unsafe = structuredClone(catalog)
    unsafe.items['avatar:1503'].artworkPath = 'game-assets/../outside.webp'
    expect(() => assertVisualCatalog(unsafe, warpSnapshot)).toThrow(/Unsafe/)
    const missing = createPresentation(
      warpSnapshot,
      { 'avatar:1503': { path: 'Elation' } },
      '/',
      warpVisualDefinitions,
    )
    expect(missing.item('avatar:1503', 'en').artworkUrl).toBeUndefined()
  })
  it('keeps overlays, language, image failures and presentation reads outside RNG and session updates', async () => {
    const rng = seeded(1984),
      simulator = useWarpSimulator({ rng }),
      overlay = useWarpOverlay()
    simulator.openSelection()
    simulator.setSelectionDraft([...warpSnapshot.sharedPools[0]!.fiveStar])
    simulator.confirmSelection()
    await simulator.draw(10)
    const session = simulator.session.value,
      consumed = rng.consumed
    expect(overlay.panel.value).toBeUndefined()
    overlay.openPanel('controls')
    overlay.openPanel('history')
    expect(overlay.panel.value).toBe('history')
    let dialogOpened = false
    overlay.openDialog(() => {
      dialogOpened = true
    }, `warp-history-${session.history[0]!.id}`)
    expect(overlay.panel.value).toBeUndefined()
    expect(dialogOpened).toBe(false)
    overlay.afterPanelHide()
    expect(dialogOpened).toBe(true)
    expect(overlay.afterDialogHide()).toBeUndefined()
    expect(overlay.panel.value).toBe('history')
    expect(overlay.takeFocus()).toBe(`warp-history-${session.history[0]!.id}`)
    overlay.closePanel()
    expect(overlay.afterPanelHide()).toBe('warp-history-trigger')
    overlay.openDialog(() => {}, 'warp-action-selection')
    expect(overlay.afterDialogHide()).toBe('warp-action-selection')
    const url = ref(adapter.item('avatar:1503', 'en').artworkUrl),
      image = useImageSource(() => url.value)
    image.fail()
    expect(image.source.value).toBeUndefined()
    for (const locale of ['zh-CN', 'en'] as const) {
      for (const entry of simulator.latestResults.value) {
        const historical = simulator.session.value.history.find((row) => row.id === entry.id)!
        expect(adapter.item(entry.event.itemId, locale)).toEqual(
          adapter.item(historical.event.itemId, locale),
        )
      }
    }
    expect(simulator.latestResults.value.map((row) => row.id)).toEqual(
      [...session.history].reverse().map((row) => row.id),
    )
    expect(simulator.session.value).toBe(session)
    expect(rng.consumed).toBe(consumed)
  })
  it('keeps stable card keys, reduced-motion, and drawers outside the result subtree', () => {
    const page = readFileSync(
      new URL('../../../src/tools/warp-simulator/WarpSimulatorPage.vue', import.meta.url),
      'utf8',
    )
    const card = readFileSync(
      new URL('../../../src/tools/warp-simulator/components/WarpResultCard.vue', import.meta.url),
      'utf8',
    )
    expect(page).toContain(':key="`${entry.batchId}:${entry.id}`"')
    expect(card).toContain('prefers-reduced-motion: reduce')
    expect(card).not.toMatch(/Math\.random|draw\(/)
    expect(page.indexOf('</section>')).toBeLessThan(page.indexOf('<Drawer'))
  })
})
