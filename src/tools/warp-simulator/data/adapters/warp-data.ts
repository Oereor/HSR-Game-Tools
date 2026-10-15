import snapshot from '../runtime/snapshot.json'
import manifest from '../runtime/manifest.json'
import visuals from '../presentation.json'
import type { WarpSnapshot } from '../schema'

export const warpSnapshot = snapshot as WarpSnapshot
export const warpManifest = manifest
export const warpVisuals = visuals.items
