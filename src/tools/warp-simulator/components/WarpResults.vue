<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Sparkles, Ticket } from '@lucide/vue'
import type { ToolLocale } from '../../../locales/types'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { createPresentation } from '../model/presentation'
import WarpResultCard from './WarpResultCard.vue'

defineProps<{
  entries: readonly HistoryEntry[]
  presentation: ReturnType<typeof createPresentation>
  sourceLabel: string
}>()
const emit = defineEmits<{ details: [entry: HistoryEntry] }>()
const { t, locale } = useI18n()
</script>

<template>
  <section aria-labelledby="warp-results-title" class="warp-results">
    <div class="warp-results-heading">
      <h2 id="warp-results-title">
        <Sparkles :size="18" aria-hidden="true" />{{ t('warp.results.title') }}
      </h2>
      <span v-if="entries.length">{{ t('warp.results.count', { count: entries.length }) }}</span>
    </div>
    <p v-if="entries.length" class="warp-result-source">{{ sourceLabel }}</p>
    <div v-if="!entries.length" class="warp-results-empty">
      <Ticket :size="36" :stroke-width="1.25" aria-hidden="true" />
      <p>{{ t('warp.results.empty') }}</p>
    </div>
    <div
      v-else
      class="warp-result-grid"
      :class="{
        'warp-ten-grid': entries.length === 10,
        'warp-single-grid': entries.length === 1,
      }"
    >
      <WarpResultCard
        v-for="(entry, index) in entries"
        :key="`${entry.batchId}:${entry.id}`"
        :entry="entry"
        :item="presentation.item(entry.event.itemId, locale as ToolLocale)"
        :index="index"
        :single="entries.length === 1"
        @details="emit('details', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.warp-results {
  min-width: 0;
  overflow: visible;
  padding: 12px 0 20px;
}
.warp-results-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.warp-results-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 19px;
  margin: 0;
}
.warp-results-heading > span,
.warp-result-source {
  font-size: 13px;
  color: var(--color-muted);
}
.warp-result-source {
  margin: 0 0 4px;
  overflow-wrap: anywhere;
}
.warp-results-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  min-height: 280px;
  border: 1px dashed var(--color-line);
  border-radius: 8px;
  padding: 24px;
  color: var(--color-muted);
  text-align: center;
  font-size: 13px;
}
.warp-result-grid {
  display: grid;
  grid-auto-rows: max-content;
  align-items: start;
  gap: 36px;
  padding: 24px;
  min-width: 0;
  overflow: visible;
}
.warp-single-grid {
  justify-items: center;
}
.warp-ten-grid {
  grid-template-columns: repeat(8, minmax(0, 1fr));
}
.warp-ten-grid > * {
  grid-column: span 2;
}
.warp-ten-grid > :nth-child(1),
.warp-ten-grid > :nth-child(8) {
  grid-column: 2 / span 2;
}
.warp-ten-grid > :nth-child(4) {
  grid-column: 1 / span 2;
}
@media (max-width: 1039px) {
  .warp-ten-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .warp-ten-grid > *,
  .warp-ten-grid > :nth-child(1),
  .warp-ten-grid > :nth-child(4),
  .warp-ten-grid > :nth-child(8) {
    grid-column: auto;
  }
}
@media (max-width: 640px) {
  .warp-ten-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
