<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowUp, ArrowDown, Timer, Check, SlidersHorizontal } from '@lucide/vue'
import GameIcon from '../../../components/ui/GameIcon.vue'
import { sampleCharacters, anchorKey } from '../prototype/sample'
import { characterName } from '../../../data/adapters/game-data'
import { formatAV } from '../model/presentation'
import type { NodeRecord } from '../../../engine/action-planner/types'
import type { ToolLocale } from '../../../locales/types'
import type { PrototypeOperation } from '../prototype/state'
defineProps<{
  records: NodeRecord[]
  selected: string
  operations: Record<string, PrototypeOperation[]>
}>()
const emit = defineEmits<{ select: [key: string] }>()
const { t, locale } = useI18n()
const character = (record: NodeRecord) => sampleCharacters.find((c) => c.id === record.id)
const name = (record: NodeRecord) => {
  const c = character(record)
  return c ? characterName(c, locale.value as ToolLocale) : t('spike.sampleEvent')
}
</script>
<template>
  <section class="navigator" :aria-label="t('spike.navigator')">
    <div class="pane-heading">
      <h2>{{ t('spike.navigator') }}</h2>
      <span class="muted">{{ t('spike.nodes', { count: records.length }) }}</span>
    </div>
    <div class="node-list">
      <button
        v-for="(record, index) in records"
        :key="anchorKey(record.anchor)"
        class="node-card"
        :class="{ 'node-selected': selected === anchorKey(record.anchor) }"
        :aria-pressed="selected === anchorKey(record.anchor)"
        :data-node="anchorKey(record.anchor)"
        @click="emit('select', anchorKey(record.anchor))"
      >
        <span class="node-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <GameIcon
          v-if="character(record)"
          :asset-key="character(record)?.assetKey"
          :name="name(record)"
          :fallback="t('planner.imageMissing')"
        /><span v-else class="event-avatar"><Timer :size="22" :stroke-width="1.75" /></span>
        <span class="node-info"
          ><span class="node-name" :title="name(record)">{{ name(record) }}</span
          ><span class="node-meta"
            ><span :class="record.kind === 'actor' ? 'camp-ally' : ''">{{
              record.kind === 'actor' ? t('spike.ally') : t('spike.eventNode')
            }}</span
            ><span v-if="record.anchor.kind === 'action'">{{
              t('spike.turn', { turn: record.anchor.turn })
            }}</span
            ><SlidersHorizontal
              v-if="operations[anchorKey(record.anchor)]?.length"
              :size="13"
              :aria-label="
                t('spike.configured', { count: operations[anchorKey(record.anchor)]?.length })
              " /></span
        ></span>
        <span class="node-values"
          ><strong>{{ formatAV(record.elapsedAV, locale as ToolLocale) }}</strong
          ><small>+{{ formatAV(record.deltaAV, locale as ToolLocale) }}</small
          ><span class="change-signals"
            ><ArrowUp
              v-if="record.actionChanges.some((c) => c.type === 'advance')"
              class="advance-color"
              :size="14"
              :aria-label="t('spike.advanceLabel')" /><ArrowDown
              v-if="record.actionChanges.some((c) => c.type === 'delay')"
              class="delay-color"
              :size="14"
              :aria-label="t('spike.delayLabel')" /><Check
              v-if="selected === anchorKey(record.anchor)"
              :size="13"
              :aria-label="t('spike.selected')" /></span
        ></span>
      </button>
    </div>
  </section>
</template>
