<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import {
  ArrowUp,
  ArrowDown,
  Zap,
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
import { actionDirections, nodeCamp } from '../model/naming'
import { operationsAt } from '../model/editor'
import { formatAV, formatNumber } from '../model/presentation'
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
const campLabel = (node: { kind?: string; camp?: string }) =>
  t(`planner.navigator.${nodeCamp(node)}`)
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
      ><span>{{
        t('planner.navigator.queueProgress', {
          count: formatNumber(queueIndex, locale as ToolLocale),
          value: formatAV(snapshot?.elapsedAV ?? 0, locale as ToolLocale),
        })
      }}</span
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
        <span
          class="camp-dot camp-dot-system"
          v-tooltip="t('planner.navigator.system')"
          role="img"
          :aria-label="t('planner.navigator.system')"
        ></span>
        <span class="event-avatar"><Flag :size="18" :stroke-width="1.75" /></span
        ><span class="node-info"
          ><span class="node-name">{{ t('ui.start') }}</span></span
        ><SlidersHorizontal
          v-if="operationsAt(plan, { kind: 'start' }).length"
          :size="14"
          :aria-label="t('ui.configured', { count: operationsAt(plan, { kind: 'start' }).length })"
        /><span class="node-values"
          ><small v-if="view === 'future'">+{{ formatAV(0, locale as ToolLocale) }}</small
          ><strong>{{ formatAV(0, locale as ToolLocale) }}</strong></span
        >
      </button>
      <button
        v-for="card in cards"
        :key="anchorKey(card.anchor)"
        class="node-card"
        :class="{ 'node-selected': anchorKey(selected) === anchorKey(card.anchor) }"
        :aria-pressed="anchorKey(selected) === anchorKey(card.anchor)"
        :data-node="anchorKey(card.anchor)"
        :aria-label="
          t('planner.navigator.node', {
            name: label(card.id),
            node:
              card.anchor.kind === 'action'
                ? t('ui.turn', { turn: formatNumber(card.anchor.turn, locale as ToolLocale) })
                : t('ui.eventNode'),
            value: formatAV(card.total, locale as ToolLocale),
          })
        "
        @click="emit('select', card.anchor)"
      >
        <span
          class="camp-dot"
          :class="`camp-dot-${nodeCamp(card)}`"
          v-tooltip="campLabel(card)"
          role="img"
          :aria-label="campLabel(card)"
        ></span
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
              >{{ campLabel(card) }}</span
            ><span v-if="card.anchor.kind === 'action'">{{
              t('ui.turn', { turn: formatNumber(card.anchor.turn, locale as ToolLocale) })
            }}</span
            ><SlidersHorizontal
              v-if="operationsAt(plan, card.anchor).length"
              :size="13"
              :aria-label="
                t('ui.configured', { count: operationsAt(plan, card.anchor).length })
              " /></span
        ></span>
        <span class="node-values"
          ><small v-if="view === 'future'" :title="t('planner.navigator.deltaAV')"
            >+{{ formatAV(card.delta, locale as ToolLocale) }}</small
          >
          <strong :title="t(view === 'future' ? 'ui.elapsedAV' : 'ui.remainingAV')">{{
            formatAV(card.total, locale as ToolLocale)
          }}</strong
          ><small v-if="view === 'queue'">{{
            t('planner.metadata.speed', {
              speed: formatNumber(card.effectiveSpeed, locale as ToolLocale),
            })
          }}</small
          ><span class="change-signals"
            ><ArrowUp
              v-if="actionDirections(card.anchor, card.actionChanges).advance"
              class="advance-color"
              v-tooltip="t('ui.affectedAdvance')"
              :size="20"
              :stroke-width="2"
              :aria-label="t('ui.affectedAdvance')" /><ArrowDown
              v-if="actionDirections(card.anchor, card.actionChanges).delay"
              class="delay-color"
              v-tooltip="t('ui.affectedDelay')"
              :size="20"
              :stroke-width="2"
              :aria-label="t('ui.affectedDelay')" /><Zap
              v-if="actionDirections(card.anchor, card.actionChanges).immediatelyAct"
              class="advance-color"
              v-tooltip="t('planner.navigator.affectedImmediate')"
              :size="20"
              :stroke-width="2"
              :aria-label="t('planner.navigator.affectedImmediate')" /></span
        ></span>
      </button>
      <p v-if="!cards.length" class="fine-print empty-sequence">{{ t('ui.emptySequence') }}</p>
    </div>
  </section>
</template>
