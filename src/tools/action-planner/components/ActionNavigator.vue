<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import {
  ArrowUp,
  ArrowDown,
  Check,
  SlidersHorizontal,
  Flag,
  ChevronLeft,
  ChevronRight,
} from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import { anchorKey } from '../../../engine/action-planner/queue'
import type {
  EventAnchor,
  NodeRecord,
  QueueSnapshot,
  SimulationPlan,
} from '../../../engine/action-planner/types'
import { actionDirections } from '../model/naming'
import { operationsAt } from '../model/editor'
import { formatAV } from '../model/presentation'
import type { ToolLocale } from '../../../locales/types'
const props = defineProps<{
  records: NodeRecord[]
  selected: EventAnchor
  plan: SimulationPlan
  snapshot?: QueueSnapshot
  queueIndex: number
  snapshotCount: number
  label: (id: string) => string
  image: (id: string) => string | undefined
}>()
const view = defineModel<'future' | 'queue'>('view', { required: true })
const emit = defineEmits<{ select: [anchor: EventAnchor]; step: [delta: -1 | 1] }>()
const { t, locale } = useI18n()
const modes = computed(() =>
  ['future', 'queue'].map((value) => ({ value, label: t(`ui.${value}`) })),
)
const cards = computed(() =>
  view.value === 'future'
    ? props.records.map((r) => ({ ...r, total: r.elapsedAV, delta: r.deltaAV }))
    : (props.snapshot?.queue ?? []).map((q) => ({
        ...q,
        total: q.remainingAV,
        delta: q.remainingAV,
      })),
)
</script>
<template>
  <section class="navigator" :aria-label="t('ui.navigator')">
    <div class="pane-heading">
      <SelectButton
        v-model="view"
        size="small"
        :options="modes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        :aria-label="t('ui.navigationMode')"
      />
    </div>
    <div v-if="view === 'queue'" class="queue-controls">
      <Button
        text
        severity="secondary"
        :disabled="queueIndex === 0"
        :aria-label="t('ui.previous')"
        @click="emit('step', -1)"
        ><ChevronLeft :size="16" /></Button
      ><span
        >{{ t('ui.completed', { count: queueIndex }) }} ·
        {{ formatAV(snapshot?.elapsedAV ?? 0, locale as ToolLocale) }} AV</span
      ><Button
        text
        severity="secondary"
        :disabled="queueIndex >= snapshotCount - 1"
        :aria-label="t('ui.next')"
        @click="emit('step', 1)"
        ><ChevronRight :size="16"
      /></Button>
    </div>
    <div class="node-list">
      <button
        class="node-card start-card"
        :class="{ 'node-selected': selected.kind === 'start' }"
        :aria-pressed="selected.kind === 'start'"
        data-node="start"
        @click="emit('select', { kind: 'start' })"
      >
        <span class="event-avatar"><Flag :size="18" :stroke-width="1.75" /></span
        ><span class="node-info"
          ><span class="node-name">{{ t('ui.start') }}</span></span
        ><SlidersHorizontal
          v-if="operationsAt(plan, { kind: 'start' }).length"
          :size="14"
          :aria-label="t('ui.configured', { count: operationsAt(plan, { kind: 'start' }).length })"
        /><span class="node-values"><strong>0.00</strong></span>
      </button>
      <button
        v-for="(card, index) in cards"
        :key="anchorKey(card.anchor)"
        class="node-card"
        :class="{ 'node-selected': anchorKey(selected) === anchorKey(card.anchor) }"
        :aria-pressed="anchorKey(selected) === anchorKey(card.anchor)"
        :data-node="anchorKey(card.anchor)"
        :aria-label="`${label(card.id)} · ${card.anchor.kind === 'action' ? t('ui.turn', { turn: card.anchor.turn }) : t('ui.eventNode')} · ${formatAV(card.total, locale as ToolLocale)} AV`"
        @click="emit('select', card.anchor)"
      >
        <span class="node-index">{{ String(index + 1).padStart(2, '0') }}</span
        ><UnitPortrait
          :src="image(card.id)"
          :name="label(card.id)"
          :event="card.kind === 'scheduledEvent'"
        /><span class="node-info"
          ><span class="node-name" :title="label(card.id)">{{ label(card.id) }}</span
          ><span class="node-meta"
            ><span
              :class="
                card.camp === 'ally' ? 'camp-ally' : card.camp === 'enemy' ? 'delay-color' : ''
              "
              >{{ card.kind === 'scheduledEvent' ? t('ui.eventNode') : t(`ui.${card.camp}`) }}</span
            ><span v-if="card.anchor.kind === 'action'">{{
              t('ui.turn', { turn: card.anchor.turn })
            }}</span
            ><SlidersHorizontal
              v-if="operationsAt(plan, card.anchor).length"
              :size="13"
              :aria-label="
                t('ui.configured', { count: operationsAt(plan, card.anchor).length })
              " /></span
        ></span>
        <span class="node-values"
          ><strong :title="t(view === 'future' ? 'ui.elapsedAV' : 'ui.remainingAV')">{{
            formatAV(card.total, locale as ToolLocale)
          }}</strong
          ><small v-if="view === 'future'">+{{ formatAV(card.delta, locale as ToolLocale) }}</small
          ><small v-else>{{ card.effectiveSpeed }} SPD</small
          ><span class="change-signals"
            ><ArrowUp
              v-if="actionDirections(card.anchor, card.actionChanges).advance"
              class="advance-color"
              :size="18"
              :stroke-width="2"
              :aria-label="t('ui.affectedAdvance')" /><ArrowDown
              v-if="actionDirections(card.anchor, card.actionChanges).delay"
              class="delay-color"
              :size="18"
              :stroke-width="2"
              :aria-label="t('ui.affectedDelay')" /><Check
              v-if="anchorKey(selected) === anchorKey(card.anchor)"
              :size="13"
              :aria-label="t('ui.selected')" /></span
        ></span>
      </button>
      <p v-if="!cards.length" class="fine-print empty-sequence">{{ t('ui.emptySequence') }}</p>
    </div>
  </section>
</template>
