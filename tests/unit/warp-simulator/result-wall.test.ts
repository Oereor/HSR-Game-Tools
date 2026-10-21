import { describe, expect, it } from 'vitest'
import {
  defaultPortraitFocus,
  portraitFocus,
  portraitFocusOverrides,
  portraitGeometry,
  validPortraitFocus,
} from '../../../src/tools/warp-simulator/model/portrait-focus'
import {
  resultWall,
  fitResultWall,
  wallCard,
} from '../../../src/tools/warp-simulator/model/result-wall'

describe('Portrait focus in the complete source canvas', () => {
  it('provides an independent default and ten reviewed overrides with valid coordinates', () => {
    expect(portraitFocus('avatar:unknown')).toBe(defaultPortraitFocus)
    expect(defaultPortraitFocus).toEqual({ x: 0.5, y: 0.3, scale: 2 })
    expect(Object.keys(portraitFocusOverrides)).toHaveLength(10)
    for (const [id, focus] of Object.entries(portraitFocusOverrides)) {
      expect(id).toMatch(/^avatar:/)
      expect(validPortraitFocus(focus)).toBe(true)
      expect(portraitFocus(id)).toBe(focus)
    }
  })
  it.each([defaultPortraitFocus, ...Object.values(portraitFocusOverrides)])(
    'maps the head to the card center for any source and card shape: %j',
    (focus) => {
      for (const [w, h, iw, ih] of [
        [224, 160, 2048, 2048],
        [224, 160, 768, 768],
        [168, 120, 2048, 2048],
        [170, 120, 1000, 1600],
      ]) {
        const geometry = portraitGeometry(w!, h!, iw!, ih!, focus)!
        expect(geometry.left + geometry.width * focus.x).toBeCloseTo(w! / 2)
        expect(geometry.top + geometry.height * focus.y).toBeCloseTo(h! / 2)
        expect(geometry.width / geometry.height).toBeCloseTo(iw! / ih!)
        // An outer card angle is deliberately absent from this interface.
        expect(Object.keys(geometry).sort()).toEqual(['height', 'left', 'top', 'width'])
      }
    },
  )
  it('keeps normalized positions identical for equivalent resized canvases and rejects invalid dimensions', () => {
    expect(portraitGeometry(224, 160, 2048, 2048, portraitFocus('avatar:1415'))).toEqual(
      portraitGeometry(224, 160, 768, 768, portraitFocus('avatar:1415')),
    )
    expect(portraitGeometry(0, 160, 2048, 2048, defaultPortraitFocus)).toBeUndefined()
    expect(portraitGeometry(224, 160, NaN, 2048, defaultPortraitFocus)).toBeUndefined()
    const invalid = { x: 2, y: NaN, scale: -1 }
    expect(validPortraitFocus(invalid)).toBe(false)
    expect(portraitGeometry(224, 160, 2048, 2048, invalid)).toEqual(
      portraitGeometry(224, 160, 2048, 2048, defaultPortraitFocus),
    )
  })
})

describe('Complete ordered 3–4–3 wall geometry', () => {
  it('keeps every rotated card and its glow inside the fitted viewport', () => {
    expect(resultWall.slots).toHaveLength(10)
    expect(wallCard.width / wallCard.height).toBe(2)
    for (const [width, height] of [
      [1872, 960],
      [1318, 640],
      [1232, 580],
      [2512, 960],
    ]) {
      const scale = fitResultWall(width!, height!)
      expect(scale).toBeGreaterThan(0)
      expect(scale).toBeLessThanOrEqual(1)
      resultWall.slots.forEach((slot, index) => {
        expect(slot.zIndex).toBe(index + 1)
        expect((slot.centerX - slot.rotatedWidth / 2 - 40) * scale).toBeGreaterThanOrEqual(0)
        expect((slot.centerY - slot.rotatedHeight / 2 - 40) * scale).toBeGreaterThanOrEqual(0)
        expect((slot.centerX + slot.rotatedWidth / 2 + 40) * scale).toBeLessThanOrEqual(width!)
        expect((slot.centerY + slot.rotatedHeight / 2 + 40) * scale).toBeLessThanOrEqual(height!)
      })
    }
  })
})
