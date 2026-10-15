import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import visuals from '../../../src/tools/warp-simulator/data/presentation.json'
import {
  warpSnapshot,
  warpVisuals,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import {
  createPresentation,
  pityRows,
  portraitUrl,
} from '../../../src/tools/warp-simulator/model/presentation'
import { useWarpPortrait } from '../../../src/tools/warp-simulator/composables/useWarpPortrait'
import { createSessionState } from '../../../src/tools/warp-simulator/engine/state'
import { fixture } from '../../fixtures/warp-simulator/fixture'
import type { ToolLocale } from '../../../src/locales/types'

describe('Warp presentation and checked local assets', () => {
  it('projects the thirty current avatars from checked metadata, with provenance and existing assets', () => {
    const source = readFileSync(new URL('../../../' + visuals.source.file, import.meta.url))
    expect(createHash('sha256').update(source).digest('hex')).toBe(visuals.source.sha256)
    const catalog = JSON.parse(source.toString())
    expect(Object.keys(warpVisuals)).toEqual(
      warpSnapshot.items.filter((item) => item.kind === 'avatar').map((item) => item.id),
    )
    expect(Object.keys(warpVisuals)).toHaveLength(30)
    for (const [id, metadata] of Object.entries(warpVisuals)) {
      const item = catalog.characters.find(
        (row: { id: string }) => row.id === id.slice('avatar:'.length),
      )
      expect(metadata.path).toBe(item.form.pathCode)
      expect(metadata.portraitPath).toBe(catalog.assets[item.assetKey].path)
      expect(existsSync(new URL('../../../public/' + metadata.portraitPath, import.meta.url))).toBe(
        true,
      )
    }
  })
  it('uses Warp localized names and optional visuals independently of engine identity', () => {
    const adapter = createPresentation(warpSnapshot, warpVisuals, '/tools/')
    expect(adapter.item('avatar:1503', 'zh-CN')).toMatchObject({
      id: 'avatar:1503',
      name: '真珠',
      path: 'Elation',
      portraitUrl: '/tools/game-assets/character/1503.webp',
    })
    expect(adapter.item('avatar:1503', 'zh-CN').element).toBeUndefined()
    expect(adapter.item('avatar:1503', 'en').name).toBe(
      warpSnapshot.items.find((v) => v.id === 'avatar:1503')!.names.en,
    )
    expect(adapter.item('light-cone:20000', 'zh-CN')).toMatchObject({
      kind: 'light-cone',
      rarity: 3,
    })
    expect(adapter.item('light-cone:20000', 'zh-CN').portraitUrl).toBeUndefined()
  })
  it('keeps unknown path/element neutral and never shows light-cone elements or invented images', () => {
    const adapter = createPresentation(fixture(), {
      'avatar:1': { path: 'Unknown', element: 'Unknown' },
      'avatar:2': {
        path: 'Mage',
        element: 'Fire',
        portraitPath: 'game-assets/character/1003.webp',
      },
      'light-cone:1': { path: 'Rogue', element: 'Fire' },
    })
    expect(adapter.item('avatar:1', 'en')).toMatchObject({
      path: undefined,
      element: undefined,
      portraitUrl: undefined,
    })
    expect(adapter.item('avatar:2', 'en')).toMatchObject({ path: 'Mage', element: 'Fire' })
    expect(adapter.item('light-cone:1', 'en')).toMatchObject({
      path: 'Rogue',
      element: undefined,
      portraitUrl: undefined,
    })
    expect(adapter.item('avatar:999', 'en')).toEqual({
      id: 'avatar:999',
      name: 'avatar:999',
      kind: undefined,
      rarity: undefined,
      path: undefined,
      element: undefined,
      portraitUrl: undefined,
    })
  })
  it.each([
    undefined,
    '',
    'https://example.invalid/image.png',
    '/game-assets/a.webp',
    'game-assets/../a.webp',
    'game-assets/./a.webp',
    'game-assets//a.webp',
    'game-assets/a.webp?x=1',
    'game-assets/%2e%2e/a.webp',
    'game-assets\\a.webp',
  ])('does not construct unsafe or missing image URLs: %s', (path) => {
    expect(portraitUrl(path, '/sub/')).toBeUndefined()
  })
  it('handles root and subpath URLs, load failure and a subsequent different image', () => {
    expect(portraitUrl('game-assets/character/1003.webp', '/')).toBe(
      '/game-assets/character/1003.webp',
    )
    expect(portraitUrl('game-assets/character/1003.webp', '/tools')).toBe(
      '/tools/game-assets/character/1003.webp',
    )
    const url = ref<string>(),
      visual = useWarpPortrait(() => url.value)
    expect(visual.source.value).toBeUndefined()
    url.value = '/tools/game-assets/character/1003.webp'
    expect(visual.source.value).toBe(url.value)
    visual.fail()
    expect(visual.source.value).toBeUndefined()
    url.value = '/tools/game-assets/character/1004.webp'
    expect(visual.source.value).toBe(url.value)
  })
  it('searches both languages and stable IDs with normalized case/width', () => {
    const snapshot = fixture()
    snapshot.items[0].names = { 'zh-CN': '合成角色', en: 'Synthetic Character' }
    const adapter = createPresentation(snapshot),
      ids = ['avatar:1', 'avatar:2']
    expect(adapter.search(ids, '合成角色')).toEqual(['avatar:1'])
    expect(adapter.search(ids, 'ＳＹＮＴＨＥＴＩＣ ＣＨＡＲＡＣＴＥＲ')).toEqual(['avatar:1'])
    expect(adapter.search(ids, 'AVATAR:1')).toEqual(['avatar:1'])
    expect(adapter.search(ids, '')).toEqual(ids)
  })
  it('keeps all four pity rows tied to state, with neutral inapplicable guarantees', () => {
    const pity = {
      ...createSessionState().groups['pity:event-avatar'],
      pullsSinceLast5: 73,
      pullsSinceLast4: 9,
      guaranteed5: true,
      guaranteed4: true,
    }
    expect(pityRows(pity, true, true)).toEqual([
      { key: 'fiveCount', count: 73 },
      { key: 'fiveGuarantee', status: 'guaranteed' },
      { key: 'fourCount', count: 9, pending: true },
      { key: 'fourGuarantee', status: 'guaranteed' },
    ])
    expect(
      pityRows({ ...pity, guaranteed5: false, guaranteed4: false }, false, false)[1].status,
    ).toBe('unavailable')
    expect(pityRows({ ...pity, guaranteed4: false }, true, false)[3].status).toBe('unavailable')
  })
  it('renders new messages and metadata labels in both languages without unresolved keys', () => {
    const { global } = createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: false,
      messages: { 'zh-CN': zhCN, en },
    })
    for (const locale of ['zh-CN', 'en'] as ToolLocale[]) {
      global.locale.value = locale
      expect(global.t('warp.title')).toBe(global.t('home.tools.warp.title'))
      for (const [key, params] of [
        ['warp.selection.count', { count: 7 }],
        ['warp.completed', { count: 10 }],
        ['warp.history.page', { current: 1, total: 40 }],
        ['warp.visual.missingImage', { name: 'test' }],
        ['warp.reset.groupConfirm', {}],
        ['warp.reset.allConfirm', {}],
      ] as const)
        expect(global.t(key, params)).not.toMatch(/\{|warp\./)
      expect(global.t('warp.pity.fourPending')).toContain('9+')
      for (const code of Object.keys(zhCN.warp.error))
        expect(global.t(`warp.error.${code}`)).not.toContain('warp.error.')
    }
  })
})
