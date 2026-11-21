<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { cellKey, sameCell, type Cell, type PuzzleMap } from '../engine/map'
import type { boardStatus, GameState } from '../engine/step'

const props = defineProps<{
  map: PuzzleMap
  origin: Cell
  width: number
  height: number
  size: number
  editable: boolean
  anchor: Cell | null
  snapshot?: GameState
  status?: ReturnType<typeof boardStatus>
}>()
const emit = defineEmits<{ cell: [point: Cell] }>()
const { t } = useI18n()
const grid = ref<HTMLElement>()
const focusIndex = ref(0)
const g = 'goldenScapegoat'
const lookups = computed(() => {
  const floors = new Set(props.map.floors.map(cellKey))
  const platforms = new Map<string, number>()
  const portals = new Map<string, number>()
  const switches = new Map<string, { token: string; type: 'platformSwitch' | 'portalSwitch' }[]>()
  function addSwitch(point: Cell, token: string, type: 'platformSwitch' | 'portalSwitch') {
    const key = cellKey(point)
    const links = switches.get(key) ?? []
    links.push({ token, type })
    switches.set(key, links)
  }
  props.map.platformGroups.forEach((group, index) => {
    group.cells.forEach((cell) => platforms.set(cellKey(cell), index))
    group.controllers.forEach((cell) => addSwitch(cell, `A${index + 1}`, 'platformSwitch'))
  })
  props.map.portalPairs.forEach((pair, index) => {
    pair.ends.forEach((cell) => portals.set(cellKey(cell), index))
    pair.controllers.forEach((cell) => addSwitch(cell, `P${index + 1}`, 'portalSwitch'))
  })

  // Project only the visible rows, even for ladders that span a large map.
  const ladderCells = new Set<string>()
  const { x, y } = props.origin
  for (const { top, bottom } of props.map.ladders) {
    if (top.x < x || top.x >= x + props.width) continue
    const last = Math.min(bottom.y, y + props.height - 1)
    for (let row = Math.max(y, top.y); row <= last; row++)
      ladderCells.add(cellKey({ x: top.x, y: row }))
  }
  return { floors, platforms, portals, switches, ladderCells }
})

const tiles = computed(() => {
  const { floors, platforms, portals, switches, ladderCells } = lookups.value
  return Array.from({ length: props.width * props.height }, (_, index) => {
    const point = {
      x: props.origin.x + (index % props.width),
      y: props.origin.y + Math.floor(index / props.width),
    }
    const key = cellKey(point)
    const platform = platforms.get(key)
    const portal = portals.get(key)
    const floor = floors.has(key)
    const ladder = ladderCells.has(key)
    const start = sameCell(props.map.start, point)
    const goal = sameCell(props.map.goal, point)
    const gold = sameCell(props.snapshot?.gold ?? null, point)
    const black = sameCell(props.snapshot?.black ?? null, point)
    const controls = switches.get(key)
    const pressed = props.status?.pressed.has(key)
    const platformOn =
      platform !== undefined &&
      (props.status?.platforms[platform] ?? props.map.platformGroups[platform].defaultEnabled)
    const portalOn =
      portal !== undefined &&
      (props.status?.portals.has(portal) ?? props.map.portalPairs[portal].initiallyOpen)
    const labels = [t(`${g}.coordinate`, point)]
    if (floor) labels.push(t(`${g}.tools.floor`))
    if (ladder) labels.push(t(`${g}.tools.ladder`))
    if (platform !== undefined)
      labels.push(
        t(`${g}.groupState`, {
          group: `A${platform + 1}`,
          state: t(`${g}.states.${platformOn ? 'on' : 'off'}`),
        }),
      )
    if (portal !== undefined)
      labels.push(
        t(`${g}.groupState`, {
          group: `P${portal + 1}`,
          state: t(`${g}.states.${portalOn ? 'open' : 'closed'}`),
        }),
      )
    for (const control of controls ?? []) {
      labels.push(`${t(`${g}.tools.${control.type}`)} ${control.token}`)
    }
    if (pressed) labels.push(t(`${g}.pressed`))
    if (start) labels.push(t(`${g}.tools.start`))
    if (goal) labels.push(t(`${g}.tools.goal`))
    if (gold) labels.push(t(`${g}.sheep.gold`))
    if (black) labels.push(t(`${g}.sheep.black`))
    return {
      point,
      key,
      floor,
      ladder,
      platform,
      platformOn,
      portal,
      portalOn,
      start,
      goal,
      gold,
      black,
      controls,
      pressed,
      anchor: sameCell(point, props.anchor),
      label: labels.join(' · '),
      hasContents: labels.length > 1,
    }
  })
})

async function navigate(event: KeyboardEvent, index: number) {
  const column = index % props.width
  const row = Math.floor(index / props.width)
  let next = index
  switch (event.key) {
    case 'ArrowLeft':
      if (column > 0) next--
      break
    case 'ArrowRight':
      if (column < props.width - 1) next++
      break
    case 'ArrowUp':
      if (row > 0) next -= props.width
      break
    case 'ArrowDown':
      if (row < props.height - 1) next += props.width
      break
    default:
      return
  }
  event.preventDefault()
  focusIndex.value = next
  await nextTick()
  grid.value?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus()
}
function revealSheep() {
  const scroller = grid.value
  const gold = scroller?.querySelector('[data-gold="true"]')?.getBoundingClientRect()
  if (!scroller || !gold) return
  const black = scroller.querySelector('[data-black="true"]')?.getBoundingClientRect() ?? gold
  const area = scroller.getBoundingClientRect()
  function delta(
    start: number,
    end: number,
    otherStart: number,
    otherEnd: number,
    viewportStart: number,
    span: number,
  ) {
    const min = Math.min(start, otherStart)
    const max = Math.max(end, otherEnd)
    if (max - min <= span) {
      start = min
      end = max
    }
    if (start < viewportStart) return start - viewportStart
    return Math.max(0, end - viewportStart - span)
  }
  scroller.scrollBy({
    left: delta(gold.left, gold.right, black.left, black.right, area.left, scroller.clientWidth),
    top: delta(gold.top, gold.bottom, black.top, black.bottom, area.top, scroller.clientHeight),
  })
}

defineExpose({ revealSheep })
</script>

<template>
  <div ref="grid" class="board-scroll">
    <div
      class="board"
      role="group"
      :aria-label="t(`${g}.board`)"
      :style="{ '--width': width, '--size': `${size}px` }"
    >
      <span class="axis" aria-hidden="true">x/y</span>
      <span v-for="column in width" :key="column" class="axis column-axis" aria-hidden="true">{{
        origin.x + column - 1
      }}</span>
      <template v-for="(tile, index) in tiles" :key="tile.key">
        <span v-if="index % width === 0" class="axis" aria-hidden="true">{{ tile.point.y }}</span>
        <component
          :is="editable ? 'button' : 'div'"
          class="tile"
          :class="{ 'tile-anchor': tile.anchor, 'tile-ladder': tile.ladder }"
          :type="editable ? 'button' : undefined"
          :role="!editable && tile.hasContents ? 'img' : undefined"
          :aria-hidden="!editable && !tile.hasContents ? true : undefined"
          :tabindex="
            editable ? (index === Math.min(focusIndex, tiles.length - 1) ? 0 : -1) : undefined
          "
          :aria-label="tile.label"
          :title="tile.label"
          :data-index="index"
          :data-gold="tile.gold || undefined"
          :data-black="tile.black || undefined"
          @click="editable && emit('cell', tile.point)"
          @focus="focusIndex = index"
          @keydown="editable && navigate($event, index)"
        >
          <span v-if="tile.start || tile.goal" class="markers" aria-hidden="true"
            >{{ tile.start ? 'S' : '' }}{{ tile.goal ? 'G' : '' }}</span
          >
          <span
            v-if="tile.portal !== undefined"
            class="portal"
            :class="{ open: tile.portalOn }"
            aria-hidden="true"
            >P{{ tile.portal + 1 }}</span
          >
          <span
            v-if="tile.controls?.length"
            class="switches"
            :class="{ pressed: tile.pressed }"
            aria-hidden="true"
          >
            {{ tile.controls.map(({ token }) => token).join('·') }}
          </span>
          <span v-if="tile.gold || tile.black" class="sheep" aria-hidden="true">
            <b v-if="tile.gold" class="gold">{{ t(`${g}.sheep.goldToken`) }}</b>
            <b v-if="tile.black" class="black">{{ t(`${g}.sheep.blackToken`) }}</b>
          </span>
          <span v-if="tile.floor" class="floor" aria-hidden="true" />
          <span
            v-if="tile.platform !== undefined"
            class="platform"
            :class="{ enabled: tile.platformOn }"
            aria-hidden="true"
            >A{{ tile.platform + 1 }}</span
          >
        </component>
      </template>
    </div>
  </div>
</template>

<style scoped>
.board-scroll {
  overflow: auto;
  max-block-size: 68vh;
  padding: 4px;
}
.board {
  display: grid;
  grid-template-columns: max-content repeat(var(--width), var(--size));
  gap: 2px;
  inline-size: max-content;
  margin-inline: auto;
}
.axis {
  display: grid;
  place-items: center;
  padding-inline: 3px;
  color: var(--color-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.column-axis {
  white-space: nowrap;
  overflow: hidden;
}
.tile {
  position: relative;
  isolation: isolate;
  inline-size: var(--size);
  block-size: var(--size);
  background: var(--color-page);
  border: 1px solid var(--color-line);
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.05;
}
button.tile:hover,
.tile-anchor {
  border-color: var(--color-accent);
  background: var(--color-surface);
}
.tile:focus-visible {
  z-index: 1;
  outline-offset: 1px;
}
.tile-ladder::before {
  content: '';
  position: absolute;
  inset: 0 37%;
  opacity: 0.65;
  border-inline: 1px solid var(--color-muted);
  background: repeating-linear-gradient(transparent 0 7px, var(--color-muted) 7px 8px);
  z-index: -1;
}
.floor,
.platform {
  position: absolute;
  inset: auto 2px 2px;
  border-radius: 2px;
}
.floor {
  block-size: 4px;
  background: var(--color-muted);
}
.platform {
  min-block-size: 8px;
  border: 1px dashed var(--color-accent);
  color: var(--color-ink);
  text-align: center;
}
.platform.enabled {
  background: var(--color-accent);
  color: var(--color-page);
  border-style: solid;
}
.markers,
.portal,
.switches {
  position: absolute;
  padding: 1px 2px;
  border-radius: 2px;
}
.markers {
  inset: 2px auto auto 2px;
  background: var(--color-ally);
  color: var(--color-page);
  font-weight: 750;
}
.portal {
  inset: 2px 2px auto auto;
  border: 1px dashed var(--color-advance);
  color: var(--color-advance);
}
.portal.open {
  background: var(--color-advance);
  color: var(--color-page);
  border-style: solid;
}
.switches {
  inset: auto 2px 7px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  background: var(--color-surface);
  border: 1px solid var(--color-muted);
  color: var(--color-ink);
  text-align: center;
}
.switches.pressed {
  background: var(--color-ally);
  border-color: var(--color-ally);
  color: var(--color-page);
}
.sheep {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 2px;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.sheep b {
  display: grid;
  place-items: center;
  border-radius: 50%;
  inline-size: 19px;
  block-size: 19px;
  font-size: 11px;
}
.gold {
  background: var(--color-accent);
  color: var(--color-page);
}
.black {
  background: var(--color-page);
  color: var(--color-ink);
  border: 1px solid var(--color-ink);
}
</style>
