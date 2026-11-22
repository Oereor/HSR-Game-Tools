import type { GroupKind } from './editor'
import { cellKey, coordinateLimit, type Cell, type Ladder } from './engine/map'
import type { Direction, GameState, Phase } from './engine/step'

const groupColors = {
  platform: ['var(--color-event)', 'var(--color-advance)'],
  portal: ['var(--color-delay)', 'var(--color-ally)'],
} as const

export interface GroupChoice {
  kind: GroupKind
  id: string
  index: number
  slot?: number
  color: string
}

export function groupChoices(kind: GroupKind, groups: { id: string }[]) {
  const assigned = new Set<number>()
  const standardIds = [`${kind}-1`, `${kind}-2`]
  const slots = standardIds.map((id, slot): GroupChoice => {
    const index = groups.findIndex((group) => group.id === id)
    if (index >= 0) assigned.add(index)
    return { kind, id, index, slot, color: groupColors[kind][slot] }
  })
  const extras: GroupChoice[] = []
  const byIndex: GroupChoice[] = []
  groups.forEach(({ id }, index) => {
    if (assigned.has(index)) return
    const vacant = slots.find((choice) => choice.index === -1)
    if (vacant) {
      vacant.id = id
      vacant.index = index
    } else {
      extras.push({ kind, id, index, color: 'var(--color-muted)' })
    }
  })
  for (const choice of [...slots, ...extras]) {
    if (choice.index >= 0) byIndex[choice.index] = choice
  }
  return { slots, extras, byIndex }
}

type Translate = (key: string, params: Record<string, string | number>) => string

export function groupName(choice: GroupChoice, t: Translate) {
  if (choice.slot === undefined) {
    return t(`goldenScapegoat.groups.${choice.kind}Named`, { id: choice.id })
  }
  return t(`goldenScapegoat.groups.${choice.kind}Slot`, { number: choice.slot + 1 })
}

export function groupDetail(choice: GroupChoice, t: Translate) {
  const name = groupName(choice, t)
  return choice.slot !== undefined && choice.id !== `${choice.kind}-${choice.slot + 1}`
    ? t('goldenScapegoat.groups.detail', { name, id: choice.id })
    : name
}

export interface GridWindow {
  x: number
  y: number
  width: number
  height: number
}

export interface BoardScroll {
  left: number
  top: number
}

export const windowLimit = 32

export function clampOrigin(value: number, span: number) {
  return Math.max(-coordinateLimit, Math.min(value, coordinateLimit - span + 1))
}

export function panEditWindow(view: GridWindow, direction: Direction): Cell {
  const horizontal = direction === 'left' || direction === 'right'
  const sign = direction === 'right' || direction === 'down' ? 1 : -1
  if (horizontal) {
    return { x: clampOrigin(view.x + sign * Math.floor(view.width / 2), view.width), y: view.y }
  }
  return { x: view.x, y: clampOrigin(view.y + sign * Math.floor(view.height / 2), view.height) }
}

export function locateEditWindow(view: GridWindow, bounds: GridWindow, start: Cell | null): Cell {
  const x = bounds.width <= view.width || !start ? bounds.x : start.x - Math.floor(view.width / 2)
  const y =
    bounds.height <= view.height || !start ? bounds.y : start.y - Math.floor(view.height / 2)
  return { x: clampOrigin(x, view.width), y: clampOrigin(y, view.height) }
}

export function mapBounds(points: Cell[]): GridWindow {
  let minX = points[0]?.x ?? 0
  let minY = points[0]?.y ?? 0
  let maxX = minX
  let maxY = minY
  for (const { x, y } of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function replayWindow(bounds: GridWindow, positions: Pick<GameState, 'gold' | 'black'>) {
  function axis(start: number, span: number, gold = start, black = gold) {
    if (span <= windowLimit) return { start, span }
    let center = gold - Math.floor(windowLimit / 2)
    if (Math.abs(gold - black) < windowLimit) {
      center = Math.min(
        Math.min(gold, black),
        Math.max(center, Math.max(gold, black) - windowLimit + 1),
      )
    }
    return {
      start: Math.max(start, Math.min(center, start + span - windowLimit)),
      span: windowLimit,
    }
  }
  const x = axis(bounds.x, bounds.width, positions.gold?.x, positions.black?.x)
  const y = axis(bounds.y, bounds.height, positions.gold?.y, positions.black?.y)
  return { x: x.start, y: y.start, width: x.span, height: y.span }
}

export function visibleLadderCells(ladders: Ladder[], { x, y, width, height }: GridWindow) {
  const result = new Set<string>()
  for (const { top, bottom } of ladders) {
    if (top.x < x || top.x >= x + width) continue
    const last = Math.min(bottom.y, y + height - 1)
    for (let row = Math.max(y, top.y + 1); row <= last; row++) {
      result.add(cellKey({ x: top.x, y: row }))
    }
  }
  return result
}

const arrows = { left: '←', right: '→', up: '↑', down: '↓' }
const wasd = { left: 'A', right: 'D', up: 'W', down: 'S' }

export function actionSequence(actions: Direction[], format: 'arrow' | 'wasd') {
  const labels = format === 'arrow' ? arrows : wasd
  return actions.map((action) => labels[action]).join(format === 'arrow' ? ' ' : '')
}

export function operationPhase(step: number, k: number): Phase {
  if (step <= k) return 'recording'
  return step - k <= k ? 'replaying' : 'postReplay'
}
