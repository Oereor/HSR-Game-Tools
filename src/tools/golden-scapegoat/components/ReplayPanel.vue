<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Keyboard,
  Triangle,
} from '@lucide/vue'
import Button from 'primevue/button'
import type { SearchResult } from '../engine/solve'
import { actionSequence, replayOperation } from '../presentation'

const props = defineProps<{
  k: number
  solution: Extract<SearchResult, { status: 'solved' }>
  frameIndex: number
}>()
const emit = defineEmits<{ frame: [index: number, intent: 'next' | 'jump'] }>()
const { t } = useI18n()
const g = 'goldenScapegoat'
const pageSize = 60
const directionRotation = { up: '0deg', right: '90deg', down: '180deg', left: '270deg' }
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
const visibleSteps = computed(() => {
  const start = page.value * pageSize
  return props.solution.actions.slice(start, start + pageSize).map((_, index) => {
    const step = start + index + 1
    return { step, ...replayOperation(props.solution, step, props.k) }
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
            <span class="step-number" aria-hidden="true">{{ item.step }}</span>
            <span class="gold-action-row" aria-hidden="true">
              <Triangle
                class="gold-action"
                :size="16"
                :stroke-width="0"
                fill="currentColor"
                :style="{ rotate: directionRotation[item.gold] }"
              />
            </span>
            <span class="black-action-row" aria-hidden="true">
              <span
                v-if="item.black"
                v-tooltip="item.black.moved ? t(`${g}.sheep.black`) : t(`${g}.invalidReplayAction`)"
                :class="{ 'invalid-action': !item.black.moved }"
              >
                <Triangle
                  :size="12"
                  :stroke-width="0"
                  fill="currentColor"
                  :style="{ rotate: directionRotation[item.black.direction] }"
                />
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
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(2, minmax(0, 1fr));
  place-items: stretch;
  gap: 0;
  inline-size: 100%;
  block-size: 3.625rem;
  padding: 0;
  border-color: var(--color-line);
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.sequence-step[aria-current='step'] {
  border-color: var(--color-accent);
}
.gold-action-row,
.black-action-row {
  display: grid;
  place-items: center;
}
.step-number {
  position: absolute;
  inset-block-start: 2px;
  inset-inline-start: 4px;
  color: var(--color-muted);
  font-size: 0.5625rem;
  line-height: 1;
}
.gold-action {
  color: var(--color-accent);
}
.black-action-row {
  border-block-start: 1px solid var(--color-line);
  color: var(--color-advance);
}
.black-action-row .invalid-action {
  color: var(--color-muted);
}
.page-controls {
  justify-content: center;
}
.replay-footer {
  grid-row: 3;
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
