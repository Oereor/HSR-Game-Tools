import type { ItemPresentation } from '../model/presentation'
import type { RevealPhase } from '../composables/useWarpReveal'
import { rarityColorVariable } from './result-presentation'

type Translate = (key: string, params: Record<string, string | number>) => string

/** Consumes resolved presentation metadata; never looks up an item or owns reveal state. */
export function revealMetadata(item: ItemPresentation, rarity: 3 | 4 | 5, t: Translate) {
  const groups: { kind: 'path' | 'element'; name: string; icon?: string; color: string }[] = []
  if (item.pathName?.trim())
    groups.push({
      kind: 'path',
      name: item.pathName,
      icon: item.pathIconUrl,
      color: 'var(--color-ink)',
    })
  if (item.kind === 'avatar' && item.elementName?.trim())
    groups.push({
      kind: 'element',
      name: item.elementName,
      icon: item.elementIconUrl,
      color: item.elementTextColor ?? 'var(--color-ink)',
    })
  const rarityLabel = t('warp.visual.rarity', { count: rarity })
  const unknown = t('warp.visual.unknown', {})
  return {
    name: item.name,
    nameColor: rarityColorVariable(rarity),
    stars: item.cardStars,
    starsReferenceAspectRatio: item.cardStarsReferenceAspectRatio ?? 5,
    rarityLabel,
    groups,
    unknown,
    description: [
      rarityLabel,
      ...(groups.length ? groups.map((group) => group.name) : [unknown]),
    ].join(t('warp.resultTooltip.separator', {})),
  }
}

/** stage is the displayed stage, including the retained stage during leaving. */
export function showRevealMetadata(stage: RevealPhase, artworkReady: boolean) {
  return artworkReady && (stage === 'artwork' || stage === 'waiting')
}
