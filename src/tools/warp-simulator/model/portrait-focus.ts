export interface PortraitFocus {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export const defaultPortraitFocus: PortraitFocus = Object.freeze({ x: 0.5, y: 0.3, scale: 2 })
// Coordinates refer to the complete StarRailRes character_portrait canvas, never alpha bounds.
export const portraitFocusOverrides: Readonly<Record<string, PortraitFocus>> = Object.freeze({
  'avatar:1001': { x: 0.49, y: 0.33, scale: 2.2 },
  'avatar:1003': { x: 0.52, y: 0.49, scale: 3.3 },
  'avatar:1415': { x: 0.52, y: 0.54, scale: 4.4 },
  'avatar:1503': { x: 0.525, y: 0.4, scale: 3.2 },
  'avatar:1101': { x: 0.475, y: 0.475, scale: 3.4 },
  'avatar:1013': { x: 0.48, y: 0.245, scale: 2.6 },
  'avatar:1201': { x: 0.485, y: 0.325, scale: 2.7 },
  'avatar:1102': { x: 0.375, y: 0.55, scale: 3.3 },
  'avatar:1107': { x: 0.425, y: 0.3125, scale: 2.9 },
  'avatar:1312': { x: 0.5625, y: 0.4075, scale: 3.1 },
})

export function validPortraitFocus(value: PortraitFocus): boolean {
  return (
    [value.x, value.y, value.scale].every(Number.isFinite) &&
    value.x >= 0 &&
    value.x <= 1 &&
    value.y >= 0 &&
    value.y <= 1 &&
    value.scale > 0
  )
}
export function portraitFocus(id: string): PortraitFocus {
  return portraitFocusOverrides[id] ?? defaultPortraitFocus
}
/** Unrotated image geometry. The card's outer transform never participates here. */
export function portraitGeometry(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  focus: PortraitFocus,
) {
  if (![width, height, imageWidth, imageHeight].every((v) => Number.isFinite(v) && v > 0))
    return undefined
  const f = validPortraitFocus(focus) ? focus : defaultPortraitFocus
  const k = Math.max(width / imageWidth, height / imageHeight) * f.scale
  return {
    width: imageWidth * k,
    height: imageHeight * k,
    left: width / 2 - k * imageWidth * f.x,
    top: height / 2 - k * imageHeight * f.y,
  }
}
