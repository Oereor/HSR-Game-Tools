<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Keyboard } from '@lucide/vue'
import Button from 'primevue/button'
import { cellKey, type Cell, type ReadyMap } from '../engine/map'
import type { SearchResult } from '../engine/solve'
import type { Event as GameEvent } from '../engine/step'
import { actionSequence, groupDetail, replayOperation, type GroupChoice } from '../presentation'

const props = defineProps<{
  map: ReadyMap
  solution: Extract<SearchResult, { status: 'solved' }>
  frameIndex: number
  platformGroups: GroupChoice[]
  portalGroups: GroupChoice[]
}>()
const emit = defineEmits<{ frame: [index: number, intent: 'next' | 'jump'] }>()
const { t } = useI18n()
const g = 'goldenScapegoat'
const pageSize = 60
const page = ref(0)
const sequenceScroll = ref<HTMLOListElement>()
const copied = ref(false)
const fallback = ref<'arrow' | 'wasd'>()
const copyOptions = [
  { format: 'arrow', message: 'copyArrow', icon: Copy },
  { format: 'wasd', message: 'copyWasd', icon: Keyboard },
] as const
let copyRequest = 0
const total = computed(() => props.solution.actions.length)
const lastPage = computed(() => Math.max(0, Math.ceil(total.value / pageSize) - 1))
const frame = computed(() => props.solution.frames[props.frameIndex])
const detailEvents = computed(() => frame.value.events.filter(({ type }) => type !== 'move'))
const visibleSteps = computed(() => {
  const start = page.value * pageSize
  return props.solution.actions.slice(start, start + pageSize).map((_, index) => {
    const step = start + index + 1
    return { step, ...replayOperation(props.solution, step, props.map.k) }
  })
})
watch(
  () => props.frameIndex,
  (index) => {
    page.value = Math.floor(Math.max(0, index - 1) / pageSize)
  },
  { immediate: true },
)
watch(
  [() => props.frameIndex, page],
  ([, currentPage], [, previousPage]) => {
    const scroller = sequenceScroll.value
    if (!scroller) return
    if (currentPage !== previousPage) scroller.scrollTop = 0
    const selected = scroller.querySelector<HTMLElement>('[aria-current="step"]')
    if (!selected) return
    const bounds = scroller.getBoundingClientRect()
    const item = selected.getBoundingClientRect()
    if (item.top < bounds.top) scroller.scrollTop += item.top - bounds.top - 4
    else if (item.bottom > bounds.bottom) scroller.scrollTop += item.bottom - bounds.bottom + 4
  },
  { flush: 'post' },
)

const navigation = computed(() => [
  { id: 'first', icon: ChevronsLeft, target: 0, disabled: props.frameIndex === 0 },
  {
    id: 'previous',
    icon: ChevronLeft,
    target: props.frameIndex - 1,
    disabled: props.frameIndex === 0,
  },
  {
    id: 'next',
    icon: ChevronRight,
    target: props.frameIndex + 1,
    disabled: props.frameIndex === total.value,
  },
  {
    id: 'last',
    icon: ChevronsRight,
    target: total.value,
    disabled: props.frameIndex === total.value,
  },
])

async function copy(format: 'arrow' | 'wasd') {
  const request = ++copyRequest
  copied.value = false
  fallback.value = undefined
  try {
    await navigator.clipboard.writeText(actionSequence(props.solution.actions, format))
    if (request === copyRequest) copied.value = true
  } catch {
    if (request === copyRequest) fallback.value = format
  }
}

function operationLabel(item: (typeof visibleSteps.value)[number]) {
  const actions = [
    t(`${g}.stepAction`, {
      sheep: t(`${g}.sheep.gold`),
      direction: t(`${g}.directions.${item.gold}`),
    }),
  ]
  if (item.black) {
    actions.push(
      t(`${g}.stepAction`, {
        sheep: t(`${g}.sheep.black`),
        direction: t(`${g}.directions.${item.black.direction}`),
      }),
    )
    if (!item.black.moved) actions.push(t(`${g}.invalidReplayAction`))
  }
  return t(`${g}.jumpStep`, { step: item.step, actions: actions.join(' · ') })
}

const controllerGroups = computed(() => {
  const cells = new Map<string, GroupChoice[]>()
  function add(controllers: Cell[], group: GroupChoice) {
    for (const point of controllers) {
      const key = cellKey(point)
      const groups = cells.get(key) ?? []
      groups.push(group)
      cells.set(key, groups)
    }
  }
  props.map.platformGroups.forEach(({ controllers }, index) =>
    add(controllers, props.platformGroups[index]),
  )
  props.map.portalPairs.forEach(({ controllers }, index) =>
    add(controllers, props.portalGroups[index]),
  )
  return cells
})

const coord = (point: Cell | null) => (point ? t(`${g}.coordinate`, { ...point }) : '—')
function eventText(event: GameEvent) {
  switch (event.type) {
    case 'move':
    case 'fall':
    case 'teleport':
      return t(`${g}.events.${event.type}`, {
        sheep: t(`${g}.sheep.${event.sheep}`),
        from: coord(event.from),
        to: coord(event.to),
      })
    case 'lost':
      return t(`${g}.events.${event.cause}`, {
        sheep: t(`${g}.sheep.${event.sheep}`),
        at: coord(event.at),
      })
    case 'controller':
      return t(`${g}.events.${event.pressed ? 'controllerPressed' : 'controllerReleased'}`, {
        at: coord(event.at),
        groups: controllerGroups.value
          .get(cellKey(event.at))
          ?.map((group) => groupDetail(group, t))
          .join(' · '),
      })
    case 'platform':
      return t(`${g}.events.platform`, {
        group: groupDetail(props.platformGroups[event.group], t),
        platform: props.map.platformGroups[event.group].platforms[event.platform].id,
        state: t(`${g}.states.${event.enabled ? 'on' : 'off'}`),
      })
    case 'portal':
      return t(`${g}.groupState`, {
        group: groupDetail(props.portalGroups[event.pair], t),
        state: t(`${g}.states.${event.open ? 'open' : 'closed'}`),
      })
    case 'spawn':
    case 'collision':
    case 'goal':
      return t(`${g}.events.${event.type}`, { at: coord(event.at) })
  }
}
</script>

<template>
  <div class="replay">
    <div class="replay-top">
      <header class="replay-heading">
        <i18n-t :keypath="`${g}.result.solved`" tag="h2" scope="global">
          <template #steps
            ><strong class="shortest-count">{{ total }}</strong></template
          >
        </i18n-t>
        <div class="copy-buttons">
          <Button
            v-for="option in copyOptions"
            :key="option.format"
            v-tooltip="t(`${g}.${option.message}`)"
            severity="secondary"
            size="small"
            text
            :aria-label="t(`${g}.${option.message}`)"
            :disabled="total === 0"
            @click="copy(option.format)"
          >
            <template #icon><component :is="option.icon" :size="17" aria-hidden="true" /></template>
          </Button>
        </div>
      </header>
      <span v-if="copied" class="hint" role="status">{{ t(`${g}.copied`) }}</span>
      <label v-if="fallback" class="hint">
        {{ t(`${g}.copyFailed`) }}
        <textarea readonly rows="2" :value="actionSequence(solution.actions, fallback)" />
      </label>
    </div>

    <div class="replay-body">
      <section v-if="total" class="sequence" :aria-label="t(`${g}.sequence`)">
        <ol ref="sequenceScroll" role="list" class="steps" :start="page * pageSize + 1">
          <li v-for="item in visibleSteps" :key="item.step">
            <Button
              class="sequence-step"
              severity="secondary"
              size="small"
              :aria-current="item.step === frameIndex ? 'step' : undefined"
              :aria-label="operationLabel(item)"
              @click="emit('frame', item.step, 'jump')"
            >
              <span class="gold-action-row" aria-hidden="true">
                <span class="step-number">{{ item.step }}</span>
                <b class="gold-action">{{ actionSequence([item.gold], 'arrow') }}</b>
              </span>
              <span class="black-action-row" aria-hidden="true">
                <span
                  v-if="item.black"
                  v-tooltip="
                    item.black.moved ? t(`${g}.sheep.black`) : t(`${g}.invalidReplayAction`)
                  "
                  :class="{ 'invalid-action': !item.black.moved }"
                >
                  {{ actionSequence([item.black.direction], 'arrow') }}
                </span>
              </span>
            </Button>
          </li>
        </ol>
        <div v-if="lastPage" class="page-controls">
          <Button
            severity="secondary"
            size="small"
            :aria-label="t(`${g}.previousPage`)"
            :title="t(`${g}.previousPage`)"
            :disabled="page === 0"
            @click="page--"
          >
            <template #icon><ChevronLeft :size="16" aria-hidden="true" /></template>
          </Button>
          <span class="hint">{{ t(`${g}.page`, { current: page + 1, total: lastPage + 1 }) }}</span>
          <Button
            severity="secondary"
            size="small"
            :aria-label="t(`${g}.nextPage`)"
            :title="t(`${g}.nextPage`)"
            :disabled="page === lastPage"
            @click="page++"
          >
            <template #icon><ChevronRight :size="16" aria-hidden="true" /></template>
          </Button>
        </div>
      </section>
      <details v-if="detailEvents.length" :key="frameIndex" class="events hint">
        <summary>{{ t(`${g}.stepEvents`) }}</summary>
        <ol>
          <li v-for="(event, index) in detailEvents" :key="index">{{ eventText(event) }}</li>
        </ol>
      </details>
    </div>

    <div class="replay-footer">
      <p class="current-step" aria-live="polite">
        {{ t(`${g}.step`, { current: frameIndex, total }) }}
      </p>
      <div class="navigation" role="group" :aria-label="t(`${g}.replay`)">
        <Button
          v-for="button in navigation"
          :key="button.id"
          v-tooltip="t(`${g}.${button.id}`)"
          severity="secondary"
          size="small"
          fluid
          :aria-label="t(`${g}.${button.id}`)"
          :disabled="button.disabled"
          @click="emit('frame', button.target, button.id === 'next' ? 'next' : 'jump')"
        >
          <template #icon><component :is="button.icon" :size="20" aria-hidden="true" /></template>
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.replay {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-block-size: 0;
  min-inline-size: 0;
  gap: 8px;
}
.replay-top {
  display: grid;
  gap: 8px;
}
.replay-body {
  display: flex;
  flex-direction: column;
  min-block-size: 0;
}
.replay-heading,
.copy-buttons,
.page-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.replay-heading {
  justify-content: space-between;
}
h2 {
  font-size: 1.0625rem;
  font-weight: 650;
}
.shortest-count {
  color: var(--color-accent);
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
}
.copy-buttons {
  flex: none;
}
.copy-buttons > button {
  min-inline-size: 2.125rem;
  min-block-size: 2.125rem;
}
.sequence {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  flex: 1;
  gap: 6px;
  min-block-size: 0;
}
.steps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 3rem), 1fr));
  align-content: start;
  gap: 6px;
  padding: 5px;
  overflow: auto;
  overscroll-behavior: contain;
}
.sequence-step {
  --step-tint: 17%;
  display: grid;
  grid-template-rows: 5fr 3fr;
  place-items: stretch;
  gap: 0;
  inline-size: 100%;
  block-size: 3.625rem;
  padding: 0;
  border-color: var(--color-line);
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.sequence-step:hover {
  --step-tint: 24%;
}
.sequence-step[aria-current='step'] {
  --step-tint: 33%;
  border-color: var(--color-accent);
}
.gold-action-row,
.black-action-row {
  display: grid;
  place-items: center;
  color: color-mix(in srgb, var(--step-color) 40%, var(--color-ink));
  background: color-mix(in srgb, var(--step-color) var(--step-tint), var(--color-surface));
}
.gold-action-row {
  --step-color: var(--color-accent);
  align-content: center;
  gap: 1px;
}
.step-number {
  font-size: 0.625rem;
  line-height: 1;
}
.gold-action {
  font-size: 1.25rem;
  line-height: 1;
}
.black-action-row {
  --step-color: var(--color-advance);
  font-size: 0.875rem;
  line-height: 1;
}
.black-action-row .invalid-action {
  opacity: 0.78;
}
.page-controls {
  justify-content: center;
}
.replay-footer {
  display: grid;
  gap: 6px;
  border-block-start: 1px solid var(--color-line);
  padding-block-start: 8px;
}
.current-step {
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}
.navigation {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}
.navigation > button {
  width: 100%;
  min-inline-size: 0;
  min-block-size: 2.5rem;
}
.hint {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
.events {
  flex: none;
  max-block-size: min(7.5rem, 48%);
  overflow: auto;
  overscroll-behavior: contain;
}
.events summary {
  position: sticky;
  inset-block-start: 0;
  background: var(--color-surface);
  cursor: pointer;
}
.events ol {
  padding-inline-start: 1.4rem;
  list-style: decimal;
  overflow-wrap: anywhere;
}
textarea {
  display: block;
  inline-size: 100%;
  margin-block-start: 4px;
  border: 1px solid var(--color-line);
  border-radius: 4px;
  background: var(--color-page);
  color: var(--color-ink);
}
</style>
