<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue'
import Button from 'primevue/button'
import { cellKey, type Cell, type ReadyMap } from '../engine/map'
import type { SearchResult } from '../engine/solve'
import type { Event as GameEvent } from '../engine/step'
import { actionSequence, groupDetail, operationPhase, type GroupChoice } from '../presentation'

const props = defineProps<{
  map: ReadyMap
  solution: Extract<SearchResult, { status: 'solved' }>
  frameIndex: number
  platformGroups: GroupChoice[]
  portalGroups: GroupChoice[]
}>()
const emit = defineEmits<{ frame: [index: number] }>()
const { t } = useI18n()
const g = 'goldenScapegoat'
const pageSize = 60
const page = ref(0)
const copied = ref(false)
const fallback = ref<'arrow' | 'wasd'>()
const total = computed(() => props.solution.actions.length)
const lastPage = computed(() => Math.max(0, Math.ceil(total.value / pageSize) - 1))
const frame = computed(() => props.solution.frames[props.frameIndex])
const phase = computed(() =>
  props.frameIndex ? operationPhase(props.frameIndex, props.map.k) : 'initial',
)
const phases = ['recording', 'replaying', 'postReplay'] as const
const legend = computed(() =>
  phases.filter((_, index) => index === 0 || total.value > props.map.k * index),
)
const visibleSteps = computed(() =>
  props.solution.actions
    .slice(page.value * pageSize, (page.value + 1) * pageSize)
    .map((action, index) => {
      const step = page.value * pageSize + index + 1
      return {
        step,
        arrow: actionSequence([action], 'arrow'),
        phase: operationPhase(step, props.map.k),
      }
    }),
)
watch(
  () => props.frameIndex,
  (index) => {
    page.value = Math.floor(Math.max(0, index - 1) / pageSize)
  },
  { immediate: true },
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
  copied.value = false
  fallback.value = undefined
  try {
    await navigator.clipboard.writeText(actionSequence(props.solution.actions, format))
    copied.value = true
  } catch {
    fallback.value = format
  }
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
    <h2>{{ t(`${g}.result.solved`, { steps: total }) }}</h2>
    <p class="hint" aria-live="polite">
      {{ t(`${g}.step`, { current: frameIndex, total }) }} · {{ t(`${g}.phase.${phase}`) }}
    </p>
    <div class="controls" role="group" :aria-label="t(`${g}.replay`)">
      <Button
        v-for="button in navigation"
        :key="button.id"
        severity="secondary"
        size="small"
        :aria-label="t(`${g}.${button.id}`)"
        :title="t(`${g}.${button.id}`)"
        :disabled="button.disabled"
        @click="emit('frame', button.target)"
      >
        <template #icon><component :is="button.icon" :size="17" aria-hidden="true" /></template>
      </Button>
    </div>
    <p class="controls positions" aria-live="polite">
      <span>{{ t(`${g}.sheep.gold`) }} {{ coord(frame.nextState.gold) }}</span>
      <span>{{ t(`${g}.sheep.black`) }} {{ coord(frame.nextState.black) }}</span>
    </p>

    <section v-if="total" class="sequence" :aria-label="t(`${g}.sequence`)">
      <div class="controls hint">
        <span v-for="part in legend" :key="part" class="legend" :class="part">
          {{ t(`${g}.phase.${part}`) }}
        </span>
      </div>
      <ol class="steps" :start="page * pageSize + 1">
        <li v-for="item in visibleSteps" :key="item.step">
          <Button
            class="sequence-step"
            :class="item.phase"
            :severity="item.step === frameIndex ? 'primary' : 'secondary'"
            size="small"
            :aria-current="item.step === frameIndex ? 'step' : undefined"
            :aria-label="
              t(`${g}.jumpStep`, {
                step: item.step,
                arrow: item.arrow,
                phase: t(`${g}.phase.${item.phase}`),
              })
            "
            @click="emit('frame', item.step)"
          >
            <span aria-hidden="true">{{ item.step }}</span>
            <b aria-hidden="true">{{ item.arrow }}</b>
          </Button>
        </li>
      </ol>
      <div v-if="lastPage" class="controls page-controls">
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
      <div class="controls">
        <Button
          :label="t(`${g}.copyArrow`)"
          severity="secondary"
          size="small"
          @click="copy('arrow')"
        />
        <Button
          :label="t(`${g}.copyWasd`)"
          severity="secondary"
          size="small"
          @click="copy('wasd')"
        />
        <span v-if="copied" class="hint" role="status">{{ t(`${g}.copied`) }}</span>
      </div>
      <label v-if="fallback" class="hint">
        {{ t(`${g}.copyFailed`) }}
        <textarea readonly rows="2" :value="actionSequence(solution.actions, fallback)" />
      </label>
    </section>

    <section v-if="frame.events.length" class="events">
      <h3>{{ t(`${g}.stepEvents`) }}</h3>
      <ol>
        <li v-for="(event, index) in frame.events" :key="index">{{ eventText(event) }}</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.replay,
.sequence,
.events {
  display: grid;
  gap: 8px;
}
h2 {
  font-size: 1.125rem;
  font-weight: 650;
}
h3 {
  font-size: 0.875rem;
  font-weight: 650;
}
.controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.positions {
  gap: 16px;
  font-size: 0.875rem;
}
.hint,
.events li {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
.steps {
  display: flex;
  flex-wrap: wrap;
  padding: 3px;
  gap: 4px;
  max-block-size: 10.5rem;
  overflow: auto;
}
.sequence-step {
  display: grid;
  gap: 0;
  justify-items: center;
  padding: 3px 7px;
  min-inline-size: 34px;
  border-block-end: 2px solid var(--phase-color);
  font-variant-numeric: tabular-nums;
}
.sequence-step span {
  font-size: 0.625rem;
}
.sequence-step b {
  line-height: 1;
}
.recording {
  --phase-color: var(--color-accent);
}
.replaying {
  --phase-color: var(--color-advance);
}
.postReplay {
  --phase-color: var(--color-ally);
}
.legend {
  border-inline-start: 2px solid var(--phase-color);
  padding-inline-start: 4px;
}
.events,
.sequence {
  border-block-start: 1px solid var(--color-line);
  padding-block-start: 10px;
}
.events ol {
  overflow: auto;
  max-block-size: 13rem;
  list-style: decimal;
  padding-inline-start: 1.4rem;
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
