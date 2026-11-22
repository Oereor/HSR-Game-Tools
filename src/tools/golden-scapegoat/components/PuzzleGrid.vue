<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Flag, Signpost } from '@lucide/vue'
import SheepMarker from './SheepMarker.vue'
import { cellKey, platformEnabled, sameCell, type Cell, type PuzzleMap } from '../engine/map'
import type { boardStatus, GameState } from '../engine/step'
import { groupDetail, visibleLadderCells, type GridWindow, type GroupChoice } from '../presentation'

const props = defineProps<{
  map: PuzzleMap
  view: GridWindow
  size: number
  editable: boolean
  anchor: Cell | null
  platformGroups: GroupChoice[]
  portalGroups: GroupChoice[]
  snapshot?: GameState
  status?: ReturnType<typeof boardStatus>
}>()
const emit = defineEmits<{ cell: [point: Cell] }>()
const { t } = useI18n()
const grid = ref<HTMLElement>()
const focusIndex = ref(0)
const g = 'goldenScapegoat'
const available = ref({ width: 0, height: 0 })
const cellSize = computed(() => {
  if (props.editable || !available.value.width) return props.size
  return Math.max(
    32,
    Math.min(
      72,
      Math.floor(available.value.width / props.view.width) - 2,
      Math.floor(available.value.height / props.view.height) - 2,
    ),
  )
})

function measure() {
  if (!grid.value) return
  available.value = {
    width: grid.value.clientWidth - 8,
    height: Math.floor(window.innerHeight * 0.68) - 8,
  }
}

let observer: ResizeObserver | undefined
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(grid.value!)
  }
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})

const lookups = computed(() => {
  const floors = new Set(props.map.floors.map(cellKey))
  const platforms = new Map<string, { group: number; index: number }>()
  const portals = new Map<string, number>()
  const switches = new Map<string, { group: GroupChoice; label: string }[]>()
  function addSwitch(point: Cell, group: GroupChoice) {
    const key = cellKey(point)
    const links = switches.get(key) ?? []
    links.push({
      group,
      label: t(`${g}.groups.controller`, { group: groupDetail(group, t) }),
    })
    switches.set(key, links)
  }
  props.map.platformGroups.forEach((group, i) => {
    group.platforms.forEach((platform, index) => {
      platform.cells.forEach((cell) => platforms.set(cellKey(cell), { group: i, index }))
    })
    group.controllers.forEach((cell) => addSwitch(cell, props.platformGroups[i]))
  })
  props.map.portalPairs.forEach((pair, index) => {
    pair.ends.forEach((cell) => portals.set(cellKey(cell), index))
    pair.controllers.forEach((cell) => addSwitch(cell, props.portalGroups[index]))
  })
  return { floors, platforms, portals, switches }
})

const ladderCells = computed(() => visibleLadderCells(props.map.ladders, props.view))
const tiles = computed(() => {
  const { floors, platforms, portals, switches } = lookups.value
  const { x, y, width, height } = props.view
  return Array.from({ length: width * height }, (_, index) => {
    const point = { x: x + (index % width), y: y + Math.floor(index / width) }
    const key = cellKey(point)
    const platform = platforms.get(key)
    const portal = portals.get(key)
    const floor = floors.has(key)
    const ladder = ladderCells.value.has(key)
    const start = sameCell(props.map.start, point)
    const goal = sameCell(props.map.goal, point)
    const gold = sameCell(props.snapshot?.gold ?? null, point)
    const black = sameCell(props.snapshot?.black ?? null, point)
    const controls = switches.get(key)
    const pressed = props.status?.pressed.has(key)
    const labels = [t(`${g}.coordinate`, point)]
    if (floor) labels.push(t(`${g}.tools.floor`))
    if (ladder) labels.push(t(`${g}.tools.ladder`))

    let platformStyle
    if (platform) {
      const group = props.platformGroups[platform.group]
      const config = props.map.platformGroups[platform.group].platforms[platform.index]
      const on =
        props.status?.platforms[platform.group][platform.index] ?? platformEnabled(config, false)
      platformStyle = { color: group.color, on }
      labels.push(
        t(`${g}.groups.platformTile`, {
          group: groupDetail(group, t),
          platform: config.id,
          polarity: t(
            `${g}.tools.${config.enabledWhenPressed ? 'platformPressed' : 'platformReleased'}`,
          ),
          state: t(`${g}.states.${on ? 'on' : 'off'}`),
        }),
      )
    }

    let portalStyle
    if (portal !== undefined) {
      const group = props.portalGroups[portal]
      const on = props.status?.portals.has(portal) ?? props.map.portalPairs[portal].initiallyOpen
      portalStyle = { color: group.color, on }
      labels.push(
        t(`${g}.groupState`, {
          group: groupDetail(group, t),
          state: t(`${g}.states.${on ? 'open' : 'closed'}`),
        }),
      )
    }
    for (const control of controls ?? []) labels.push(control.label)
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
      platformStyle,
      portalStyle,
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
  const { width, height } = props.view
  const column = index % width
  const row = Math.floor(index / width)
  let next = index
  switch (event.key) {
    case 'ArrowLeft':
      if (column > 0) next--
      break
    case 'ArrowRight':
      if (column < width - 1) next++
      break
    case 'ArrowUp':
      if (row > 0) next -= width
      break
    case 'ArrowDown':
      if (row < height - 1) next += width
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

let editScroll = { left: 0, top: 0 }
watch(
  () => props.editable,
  (editable) => {
    if (!editable && grid.value)
      editScroll = { left: grid.value.scrollLeft, top: grid.value.scrollTop }
    if (editable)
      void nextTick(() => {
        if (props.editable) grid.value?.scrollTo(editScroll)
      })
  },
)
watch(
  [() => props.snapshot, cellSize],
  () => {
    if (!props.editable) revealSheep()
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="grid" class="board-scroll">
    <div
      class="board"
      :class="{ 'board-edit': editable }"
      role="group"
      :aria-label="t(`${g}.board`)"
      :style="{ '--width': view.width, '--size': `${cellSize}px` }"
    >
      <template v-if="editable">
        <span class="axis" aria-hidden="true">x/y</span>
        <span
          v-for="column in view.width"
          :key="column"
          class="axis column-axis"
          aria-hidden="true"
          >{{ view.x + column - 1 }}</span
        >
      </template>
      <template v-for="(tile, index) in tiles" :key="tile.key">
        <span v-if="editable && index % view.width === 0" class="axis" aria-hidden="true">{{
          tile.point.y
        }}</span>
        <component
          :is="editable ? 'button' : 'div'"
          class="tile"
          :class="{
            'tile-anchor': tile.anchor,
            'tile-ladder': tile.ladder,
            'tile-marked': tile.start || tile.goal,
            'tile-switches': tile.controls?.length,
          }"
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
          <Signpost v-if="tile.start" class="marker start" aria-hidden="true" focusable="false" />
          <Flag v-if="tile.goal" class="marker goal" aria-hidden="true" focusable="false" />
          <span
            v-if="tile.portalStyle"
            class="portal"
            :class="{ open: tile.portalStyle.on }"
            :style="{ '--group-color': tile.portalStyle.color }"
            aria-hidden="true"
          />
          <span
            v-if="tile.controls?.length"
            class="switches"
            :class="{ pressed: tile.pressed }"
            aria-hidden="true"
          >
            <span
              v-for="control in tile.controls"
              :key="`${control.group.kind}:${control.group.id}`"
              :style="{ '--group-color': control.group.color }"
            />
          </span>
          <span v-if="tile.gold || tile.black" class="sheep" aria-hidden="true">
            <SheepMarker v-if="tile.gold" sheep="gold" class="sheep-marker" />
            <SheepMarker v-if="tile.black" sheep="black" class="sheep-marker" />
          </span>
          <span v-if="tile.floor" class="floor" aria-hidden="true" />
          <span
            v-if="tile.platformStyle"
            class="platform"
            :class="{ enabled: tile.platformStyle.on }"
            :style="{ '--group-color': tile.platformStyle.color }"
            aria-hidden="true"
          />
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
  grid-template-columns: repeat(var(--width), var(--size));
  gap: 2px;
  inline-size: max-content;
  margin-inline: auto;
}
.board-edit {
  grid-template-columns: max-content repeat(var(--width), var(--size));
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
  --marker-size: clamp(12px, calc(var(--size) * 0.32), 21px);
  --piece-top: 2px;
  --piece-bottom: 7px;
  position: relative;
  isolation: isolate;
  inline-size: var(--size);
  block-size: var(--size);
  background: var(--color-page);
  border: 1px solid var(--color-line);
  border-radius: 4px;
}
.tile-marked {
  --piece-top: calc(var(--marker-size) - 1px);
}
.tile-switches {
  --piece-bottom: 12px;
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
  block-size: 6px;
  border: 1px dashed var(--group-color);
}
.platform.enabled {
  background: var(--group-color);
  border-style: solid;
}
.marker {
  position: absolute;
  z-index: 1;
  inset-block-start: 1px;
  inline-size: var(--marker-size);
  block-size: var(--marker-size);
  pointer-events: none;
}
.start {
  inset-inline-start: 1px;
  color: var(--color-advance);
}
.goal {
  inset-inline-end: 1px;
  color: var(--color-ally);
}
.portal {
  position: absolute;
  inset: max(var(--piece-top), 13%) 15% 7px;
  border: 2px dashed var(--group-color);
  border-radius: 45% 45% 2px 2px;
}
.portal.open {
  border-style: solid;
  background: color-mix(in srgb, var(--group-color) 20%, transparent);
}
.switches {
  position: absolute;
  inset: auto 3px 7px;
  z-index: 1;
  display: flex;
  justify-content: center;
  gap: 2px;
  overflow: hidden;
}
.switches span {
  min-inline-size: 5px;
  inline-size: 10px;
  block-size: 5px;
  border: 1px solid var(--group-color);
  border-radius: 3px;
  background: var(--color-page);
}
.switches.pressed span {
  background: var(--group-color);
}
.sheep {
  position: absolute;
  inset: var(--piece-top) 2px var(--piece-bottom);
  display: flex;
  gap: 2px;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.sheep-marker {
  min-inline-size: 0;
  inline-size: clamp(15px, calc(var(--size) * 0.52), 34px);
  block-size: 100%;
  max-block-size: 34px;
}
</style>
