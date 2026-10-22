<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { HButton } from 'astral-ui/components'
import 'astral-ui/scoped-theme.css'
import '../ui/controls.css'
import WarpVisualIcon from './WarpVisualIcon.vue'
import { rarityColorVariable } from './result-presentation'
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
}>()
const emit = defineEmits<{ page: [page: number]; details: [entry: HistoryEntry] }>()
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
    <div
      v-else
      class="warp-history-scroll"
      role="region"
      :aria-label="t('warp.history.title')"
      tabindex="0"
    >
      <table class="warp-history-table">
        <thead>
          <tr>
            <th scope="col">{{ t('warp.history.name') }}</th>
            <th scope="col">{{ t('warp.history.kind') }}</th>
            <th scope="col">{{ t('warp.history.rarity') }}</th>
            <th scope="col">{{ t('warp.visual.path') }}</th>
            <th scope="col">{{ t('warp.visual.element') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ entry, item } in rows" :key="entry.id">
            <td>
              <Button
                :id="`warp-history-${entry.id}`"
                v-tooltip="item.name"
                unstyled
                class="warp-history-name"
                :style="{ color: rarityColorVariable(entry.event.rarity) }"
                :aria-label="t('warp.details.open', { summary: item.name })"
                aria-haspopup="dialog"
                @click="emit('details', entry)"
                >{{ item.name }}</Button
              >
            </td>
            <td>{{ t(`warp.itemKind.${item.kind ?? 'unknown'}`) }}</td>
            <td>
              <WarpVisualIcon
                :url="item.starsUrl"
                :label="t('warp.visual.rarity', { count: entry.event.rarity })"
                stars
              />
            </td>
            <td>
              <span class="warp-history-meta"
                ><WarpVisualIcon
                  :url="item.pathIconUrl"
                  :label="item.pathName ?? t('warp.visual.unknown')"
                />{{ item.pathName ?? t('warp.visual.unknown') }}</span
              >
            </td>
            <td>
              <span
                v-if="item.kind === 'avatar'"
                class="warp-history-meta"
                :style="{ color: item.elementColor }"
                ><WarpVisualIcon
                  :url="item.elementIconUrl"
                  :label="item.elementName ?? t('warp.visual.unknown')"
                />{{ item.elementName ?? t('warp.visual.unknown') }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav
      v-if="total > HISTORY_PAGE_SIZE"
      class="warp-history-pagination"
      :aria-label="t('warp.history.pagination')"
    >
      <HButton
        class="h-theme warp-astral-button"
        variant="ghost"
        v-tooltip="t('warp.history.previous')"
        :aria-label="t('warp.history.previous')"
        :disabled="page === 0"
        @click="emit('page', page - 1)"
        ><ChevronLeft :size="16" aria-hidden="true"
      /></HButton>
      <span>{{
        t('warp.history.page', { current: page + 1, total: Math.ceil(total / HISTORY_PAGE_SIZE) })
      }}</span>
      <HButton
        class="h-theme warp-astral-button"
        variant="ghost"
        v-tooltip="t('warp.history.next')"
        :aria-label="t('warp.history.next')"
        :disabled="(page + 1) * HISTORY_PAGE_SIZE >= total"
        @click="emit('page', page + 1)"
        ><ChevronRight :size="16" aria-hidden="true"
      /></HButton>
    </nav>
  </section>
</template>

<style scoped>
.warp-history {
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
.warp-history-limit,
.warp-history-empty {
  font-size: 12px;
  color: var(--color-muted);
}
.warp-history-limit {
  margin: 8px 0 14px;
  line-height: 1.6;
}
.warp-history-scroll {
  overflow-x: auto;
}
.warp-history-table {
  width: 100%;
  min-width: 720px;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
  font-size: 14px;
  line-height: 1.6;
  background: var(--color-surface);
}
th,
td {
  padding: 12px 10px;
  vertical-align: middle;
  white-space: nowrap;
  border-bottom: 1px solid var(--color-line);
}
th {
  font-weight: 500;
  color: var(--color-muted);
}
th:first-child {
  width: auto;
}
th:nth-child(2) {
  width: 104px;
}
th:nth-child(3) {
  width: 100px;
}
th:nth-child(4) {
  width: 148px;
}
th:nth-child(5) {
  width: 128px;
}
.warp-history-name {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  padding: 4px 0;
  background: transparent;
  border: 0;
  font: inherit;
  border-radius: 3px;
}
.warp-history-name:hover,
.warp-history-name:focus-visible {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.warp-history-name:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.warp-history-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
