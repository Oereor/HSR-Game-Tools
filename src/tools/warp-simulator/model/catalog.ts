import type { WarpBanner, WarpSnapshot } from '../data/schema'
import { resolvePool } from '../engine/resolver'
import type { PityGroup, WarpDiagnostic } from '../engine/types'

export interface AvailableBanner {
  readonly banner: Readonly<WarpBanner>
  readonly pityGroup: PityGroup
  readonly eligibleAvatarIds: readonly string[]
  readonly requiresSelection: boolean
}
export function availableBanners(snapshot: WarpSnapshot) {
  const banners: AvailableBanner[] = []
  const diagnostics: { bannerId: string; diagnostic: WarpDiagnostic }[] = []
  for (const banner of snapshot.banners) {
    const requiresSelection = banner.kind === 'event-avatar' || banner.kind === 'fate-avatar'
    const eligible = requiresSelection
      ? (snapshot.sharedPools.find((pool) => pool.id === banner.sharedPool)?.fiveStar ?? [])
      : []
    // This witness validates configuration only. It is never saved or used for a draw.
    const result = resolvePool(
      snapshot,
      banner.id,
      requiresSelection ? { selectedAvatarIds: eligible.slice(0, 7) } : {},
    )
    if (result.ok)
      banners.push(
        Object.freeze({
          banner,
          pityGroup: result.value.pityGroup,
          requiresSelection,
          eligibleAvatarIds: Object.freeze([...eligible]),
        }),
      )
    else diagnostics.push({ bannerId: banner.id, diagnostic: result.diagnostic })
  }
  return { banners: Object.freeze(banners), diagnostics: Object.freeze(diagnostics) }
}
