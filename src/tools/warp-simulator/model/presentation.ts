import type { ToolLocale } from '../../../locales/types'
import type { WarpSnapshot } from '../data/schema'
import type { PityState } from '../engine/types'

export const PATH_CODES = [
  'Elation',
  'Knight',
  'Mage',
  'Memory',
  'Priest',
  'Rogue',
  'Shaman',
  'Warlock',
  'Warrior',
] as const
export const ELEMENT_CODES = [
  'Physical',
  'Fire',
  'Ice',
  'Thunder',
  'Wind',
  'Quantum',
  'Imaginary',
] as const
export interface VisualMetadata {
  readonly path?: string
  readonly element?: string
  readonly portraitPath?: string
}
export type VisualCatalog = Readonly<Record<string, VisualMetadata>>
export interface ItemPresentation {
  readonly id: string
  readonly name: string
  readonly kind?: 'avatar' | 'light-cone'
  readonly rarity?: 3 | 4 | 5
  readonly path?: string
  readonly element?: string
  readonly portraitUrl?: string
}
export function portraitUrl(path: string | undefined, base: string): string | undefined {
  if (
    !path ||
    !path.startsWith('game-assets/') ||
    /[\\:?#%]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    return undefined
  return base.replace(/\/?$/, '/') + path
}
export function createPresentation(
  snapshot: WarpSnapshot,
  visuals: VisualCatalog = {},
  base = '/',
) {
  const items = new Map(snapshot.items.map((item) => [item.id, item]))
  const item = (id: string, locale: ToolLocale): ItemPresentation => {
    const source = items.get(id),
      visual = visuals[id]
    return {
      id,
      name: source?.names[locale] ?? id,
      kind: source?.kind,
      rarity: source?.rarity,
      path:
        visual?.path && (PATH_CODES as readonly string[]).includes(visual.path)
          ? visual.path
          : undefined,
      element:
        source?.kind === 'avatar' &&
        visual?.element &&
        (ELEMENT_CODES as readonly string[]).includes(visual.element)
          ? visual.element
          : undefined,
      portraitUrl: source ? portraitUrl(visual?.portraitPath, base) : undefined,
    }
  }
  const search = (ids: readonly string[], query: string) => {
    const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase()
    const q = normalize(query)
    return ids.filter((id) => {
      const source = items.get(id)
      return [id, source?.names['zh-CN'] ?? '', source?.names.en ?? ''].some((value) =>
        normalize(value).includes(q),
      )
    })
  }
  return { item, search }
}
export function pityRows(pity: PityState, hasUp5: boolean, hasUp4: boolean) {
  return [
    { key: 'fiveCount', count: pity.pullsSinceLast5 },
    {
      key: 'fiveGuarantee',
      status: hasUp5 ? (pity.guaranteed5 ? 'guaranteed' : 'normal') : 'unavailable',
    },
    { key: 'fourCount', count: pity.pullsSinceLast4, pending: pity.pullsSinceLast4 === 9 },
    {
      key: 'fourGuarantee',
      status: hasUp4 ? (pity.guaranteed4 ? 'guaranteed' : 'normal') : 'unavailable',
    },
  ] as const
}
