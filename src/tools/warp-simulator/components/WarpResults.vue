<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Sparkles, Ticket } from '@lucide/vue'
import type { ToolLocale } from '../../../locales/types'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { createPresentation } from '../model/presentation'
import WarpResultCard from './WarpResultCard.vue'
import WarpResultsWall from './WarpResultsWall.vue'

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
      class="warp-results-content"
      :class="{ 'warp-single-result': entries.length === 1 }"
    >
      <WarpResultsWall
        v-if="entries.length === 10"
        :entries="entries"
        :presentation="presentation"
        layout="flat"
        id-prefix="warp-result"
        @details="emit('details', $event)"
      />
      <template v-else>
        <WarpResultCard
          v-for="(entry, index) in entries"
          :key="`${entry.batchId}:${entry.id}`"
          :entry="entry"
          :item="presentation.item(entry.event.itemId, locale as ToolLocale)"
          :index="index"
          @details="emit('details', $event)"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.warp-results {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  padding: 12px 0 20px;
}
.warp-results-heading {
  flex-shrink: 0;
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
  flex-shrink: 0;
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
.warp-results-content {
  min-width: 0;
  min-height: 0;
}
.warp-single-result {
  display: grid;
  place-items: center;
  padding: 48px;
}
.warp-single-result > .warp-result-card {
  width: 100%;
  max-width: 620px;
}
@media (min-width: 1040px) and (min-height: 640px) {
  .warp-results-content,
  .warp-results-empty {
    flex: 1;
  }
  .warp-results-empty {
    min-height: 0;
  }
  .warp-single-result {
    container-type: size;
  }
  .warp-single-result > .warp-result-card {
    width: min(100%, 620px, 200cqh);
  }
}
@media (max-width: 640px) {
  .warp-single-result {
    padding: 32px;
  }
}
</style>
