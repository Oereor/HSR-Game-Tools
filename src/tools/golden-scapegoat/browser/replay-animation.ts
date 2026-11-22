import { sameCell, type Cell } from '../engine/map'
import type { Sheep } from '../engine/step'
import { replaySheep, type SheepMotionStage, type SheepPositions } from '../replay-motion'

type Placement = (
  point: Cell,
  who: Sheep,
  shared: boolean,
) => { transform: string; opacity: string }

export async function animateReplayStage(
  markers: Record<Sheep, HTMLElement>,
  before: SheepPositions,
  stage: SheepMotionStage,
  place: Placement,
  signal: AbortSignal,
) {
  async function animate(from: SheepPositions, to: SheepPositions, duration: number) {
    if (signal.aborted) return
    const animations: Animation[] = []
    const cancel = () => animations.forEach((animation) => animation.cancel())
    signal.addEventListener('abort', cancel, { once: true })
    try {
      for (const who of replaySheep) {
        const marker = markers[who]
        const start = keyframe(from, to, who)
        const end = keyframe(to, from, who)
        // Commit the end styles before applying the temporary keyframes.
        Object.assign(marker.style, end)
        if (start.transform === end.transform && start.opacity === end.opacity) continue
        const animation = marker.animate([start, end], {
          duration,
          easing: stage.type === 'fall' ? 'ease-in' : 'ease-in-out',
          fill: 'both',
        })
        animations.push(animation)
      }
      await Promise.all(animations.map((animation) => animation.finished))
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      signal.removeEventListener('abort', cancel)
      // Also handle a partial batch if a later marker could not animate.
      for (const animation of animations) void animation.finished.catch(() => {})
      cancel()
    }
  }

  function keyframe(positions: SheepPositions, fallback: SheepPositions, who: Sheep) {
    const point = positions[who] ?? fallback[who]
    if (!point) return { transform: 'none', opacity: '0' }
    const { gold, black } = positions[who] ? positions : fallback
    const placement = place(point, who, sameCell(gold, black))
    return {
      transform: placement.transform,
      opacity: positions[who] ? placement.opacity : '0',
    }
  }

  const after = stage.positions
  if (stage.type === 'teleport') {
    const hidden = {
      gold: sameCell(before.gold, after.gold) ? before.gold : null,
      black: sameCell(before.black, after.black) ? before.black : null,
    }
    await animate(before, hidden, 100)
    await animate(hidden, after, 100)
    return
  }

  await animate(before, after, stage.type === 'move' ? 200 : stage.type === 'fall' ? 140 : 120)
}
