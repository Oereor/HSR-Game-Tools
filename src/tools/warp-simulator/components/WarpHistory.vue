<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { ChevronLeft, ChevronRight, History } from '@lucide/vue'
import type { ToolLocale } from '../../../locales/types'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import { HISTORY_LIMIT, HISTORY_PAGE_SIZE } from '../composables/useWarpSimulator'
import type { createPresentation } from '../model/presentation'
const props = defineProps<{
  entries: readonly HistoryEntry[]
  total: number
  page: number
  presentation: ReturnType<typeof createPresentation>
  sourceLabel: (bannerId: string) => string
}>()
const emit = defineEmits<{ page: [page: number] }>()
const { t, locale } = useI18n()
const rows = computed(() =>
  props.entries.map((entry) => ({
    entry,
    item: props.presentation.item(entry.event.itemId, locale.value as ToolLocale),
  })),
)
</script>

<template>
  <section aria-labelledby="warp-history-title" class="warp-history">
    <header class="warp-history-heading">
      <h2 id="warp-history-title">
        <History :size="18" aria-hidden="true" />{{ t('warp.history.title') }}
      </h2>
      <span>{{ t('warp.history.count', { count: total }) }}</span>
    </header>
    <p class="warp-history-limit">{{ t('warp.history.limit', { count: HISTORY_LIMIT }) }}</p>
    <p v-if="!total" class="warp-history-empty">{{ t('warp.history.empty') }}</p>
    <ol v-else class="warp-history-list" :aria-label="t('warp.history.title')">
      <li v-for="{ entry, item } in rows" :key="entry.id" class="warp-history-row">
        <span
          class="warp-history-rarity"
          :class="`warp-history-rarity-${entry.event.rarity}`"
          :aria-label="t('warp.visual.rarity', { count: entry.event.rarity })"
          >{{ entry.event.rarity }}★</span
        >
        <div class="warp-history-item">
          <div class="warp-history-name">
            <strong :title="item.name">{{ item.name }}</strong
            ><Tag v-if="entry.event.isUp === true" :value="t('warp.up')" severity="secondary" />
          </div>
          <p>
            {{ t('warp.visual.path') }} ·
            {{ item.path ? t(`warp.path.${item.path}`) : t('warp.visual.unknown')
            }}<template v-if="item.kind === 'avatar'">
              · {{ t('warp.visual.element') }} ·
              {{
                item.element ? t(`warp.element.${item.element}`) : t('warp.visual.unknown')
              }}</template
            >
          </p>
          <p class="warp-history-source">
            {{ sourceLabel(entry.event.bannerId)
            }}<span v-if="entry.event.rarity === 5">
              ·
              {{
                t('warp.history.fiveCount', { count: entry.event.pityBefore.pullsSinceLast5 + 1 })
              }}</span
            >
          </p>
        </div>
        <span class="warp-history-number">#{{ entry.id }}</span>
      </li>
    </ol>
    <nav
      v-if="total > HISTORY_PAGE_SIZE"
      class="warp-history-pagination"
      :aria-label="t('warp.history.pagination')"
    >
      <Button
        v-tooltip="t('warp.history.previous')"
        :aria-label="t('warp.history.previous')"
        severity="secondary"
        text
        :disabled="page === 0"
        @click="emit('page', page - 1)"
        ><template #icon><ChevronLeft :size="16" aria-hidden="true" /></template
      ></Button>
      <span>{{
        t('warp.history.page', { current: page + 1, total: Math.ceil(total / HISTORY_PAGE_SIZE) })
      }}</span>
      <Button
        v-tooltip="t('warp.history.next')"
        :aria-label="t('warp.history.next')"
        severity="secondary"
        text
        :disabled="(page + 1) * HISTORY_PAGE_SIZE >= total"
        @click="emit('page', page + 1)"
        ><template #icon><ChevronRight :size="16" aria-hidden="true" /></template
      ></Button>
    </nav>
  </section>
</template>

<style scoped>
.warp-history {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--color-line);
  min-width: 0;
}
.warp-history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.warp-history-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
}
.warp-history-heading > span,
.warp-history-limit {
  font-size: 12px;
  color: var(--color-muted);
}
.warp-history-limit {
  margin: 8px 0 14px;
  line-height: 1.6;
}
.warp-history-empty {
  font-size: 13px;
  color: var(--color-muted);
}
.warp-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.warp-history-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-line) 65%, transparent);
}
.warp-history-rarity {
  width: 28px;
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--color-muted);
  font-size: 12px;
}
.warp-history-rarity-5 {
  color: var(--color-accent);
}
.warp-history-rarity-4 {
  color: var(--p-surface-200);
}
.warp-history-item {
  min-width: 0;
  flex: 1;
}
.warp-history-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}
.warp-history-name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  font-size: 13px;
}
.warp-history-item p {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--color-muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.warp-history-number {
  color: var(--color-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  padding-top: 5px;
}
.warp-history-pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-muted);
}
</style>
