<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'
defineProps<{ entry: HistoryEntry; item: ItemPresentation; index: number; single: boolean }>()
const { t } = useI18n()
</script>

<template>
  <article
    class="warp-result-card"
    :class="[`warp-rarity-${entry.event.rarity}`, { 'warp-result-single': single }]"
    :style="{ '--warp-delay': `${index * 50}ms` }"
  >
    <div class="warp-card-top">
      <span class="warp-card-order">{{ index + 1 }}</span
      ><Tag v-if="entry.event.isUp === true" :value="t('warp.up')" severity="secondary" />
    </div>
    <div class="warp-card-visual"><WarpItemVisual :item="item" /></div>
    <p class="warp-stars" :aria-label="t('warp.visual.rarity', { count: entry.event.rarity })">
      {{ entry.event.rarity }}★
    </p>
    <h3 class="warp-item-name" :title="item.name">{{ item.name }}</h3>
    <p class="warp-card-meta" :title="t('warp.visual.path')">
      {{ t('warp.visual.path') }} ·
      {{ item.path ? t(`warp.path.${item.path}`) : t('warp.visual.unknown') }}
    </p>
    <p v-if="item.kind === 'avatar'" class="warp-card-meta">
      {{ t('warp.visual.element') }} ·
      {{ item.element ? t(`warp.element.${item.element}`) : t('warp.visual.unknown') }}
    </p>
  </article>
</template>

<style scoped>
.warp-result-card {
  --warp-rarity: var(--p-surface-500);
  position: relative;
  min-width: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--warp-rarity) 50%, var(--color-line));
  border-top: 2px solid var(--warp-rarity);
  border-radius: 7px;
  background: color-mix(in srgb, var(--warp-rarity) 4%, var(--color-surface));
  animation: warp-result-in 180ms ease-out both;
  animation-delay: var(--warp-delay);
}
.warp-rarity-4 {
  --warp-rarity: var(--p-surface-200);
}
.warp-rarity-5 {
  --warp-rarity: var(--color-accent);
}
.warp-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22px;
}
.warp-card-order {
  font-size: 11px;
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
}
.warp-card-visual {
  width: 100%;
  height: 88px;
  margin: 6px 0 8px;
}
.warp-result-card .warp-stars {
  margin: 0 0 5px;
  color: var(--warp-rarity);
  font-size: 12px;
  letter-spacing: 1px;
}
.warp-result-card .warp-item-name {
  margin: 0 0 7px;
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.warp-result-card .warp-card-meta {
  margin: 3px 0 0;
  color: var(--color-muted);
  font-size: 11px;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.warp-result-single {
  width: min(100%, 320px);
  padding: 20px;
}
.warp-result-single .warp-card-visual {
  height: 180px;
}
.warp-result-single .warp-item-name {
  font-size: 20px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.warp-result-single .warp-stars {
  font-size: 15px;
}
.warp-result-single .warp-card-meta {
  font-size: 13px;
}
@keyframes warp-result-in {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .warp-result-card {
    animation: none;
  }
}
</style>
