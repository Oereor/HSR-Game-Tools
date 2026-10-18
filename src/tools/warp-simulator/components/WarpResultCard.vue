<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'
import WarpVisualIcon from './WarpVisualIcon.vue'
const props = defineProps<{
  entry: HistoryEntry
  item: ItemPresentation
  index: number
  single: boolean
}>()
const emit = defineEmits<{ details: [entry: HistoryEntry] }>()
const { t } = useI18n()
const summary = computed(() =>
  t('warp.details.summary', {
    name: props.item.name,
    kind: t(`warp.itemKind.${props.item.kind ?? 'unknown'}`),
    rarity: props.entry.event.rarity,
    path: props.item.pathName ?? t('warp.visual.unknown'),
    element:
      props.item.kind === 'avatar'
        ? (props.item.elementName ?? t('warp.visual.unknown'))
        : t('warp.visual.notApplicable'),
  }),
)
</script>

<template>
  <Button
    :id="`warp-result-${entry.id}`"
    v-tooltip="summary"
    unstyled
    type="button"
    class="warp-result-card"
    :class="[`warp-rarity-${entry.event.rarity}`, { 'warp-result-single': single }]"
    :style="{ '--warp-delay': `${index * 50}ms` }"
    :aria-label="t('warp.details.open', { summary })"
    aria-haspopup="dialog"
    @click="emit('details', entry)"
  >
    <span class="warp-card-visual"><WarpItemVisual :item="item" artwork crop /></span>
    <span v-if="entry.event.isUp === true" class="warp-up">{{ t('warp.up') }}</span>
    <span class="warp-card-icons">
      <span class="warp-icon-slot">
        <WarpVisualIcon
          v-tooltip="item.pathName ?? t('warp.visual.unknown')"
          :url="item.pathIconUrl"
          :label="item.pathName ?? t('warp.visual.unknown')"
        />
      </span>
      <span class="warp-icon-slot">
        <WarpVisualIcon
          v-if="item.kind === 'avatar'"
          v-tooltip="item.elementName ?? t('warp.visual.unknown')"
          :url="item.elementIconUrl"
          :label="item.elementName ?? t('warp.visual.unknown')"
        />
      </span>
      <span class="warp-icon-slot">
        <WarpVisualIcon
          :url="item.starsUrl"
          :label="t('warp.visual.rarity', { count: entry.event.rarity })"
          stars
        />
      </span>
    </span>
  </Button>
</template>

<style scoped>
.warp-result-card {
  --warp-rarity: var(--p-warp-rarity-3);
  --warp-near-glow: 20%;
  --warp-outer-glow: 10%;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(56px, 27%);
  grid-template-rows: minmax(0, 1fr);
  align-items: stretch;
  width: 100%;
  aspect-ratio: 2.1 / 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: visible;
  color: var(--color-ink);
  border: 2px solid var(--warp-rarity);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow:
    0 0 4px color-mix(in srgb, var(--warp-rarity) var(--warp-near-glow), transparent),
    0 0 16px color-mix(in srgb, var(--warp-rarity) var(--warp-outer-glow), transparent),
    inset 0 0 8px color-mix(in srgb, var(--warp-rarity) 12%, transparent);
  animation: warp-result-in 180ms ease-out both;
  animation-delay: var(--warp-delay);
}
.warp-rarity-4 {
  --warp-rarity: var(--p-warp-rarity-4);
  --warp-near-glow: 65%;
  --warp-outer-glow: 32%;
}
.warp-rarity-5 {
  --warp-rarity: var(--p-warp-rarity-5);
  --warp-near-glow: 85%;
  --warp-outer-glow: 46%;
}
.warp-result-card:hover {
  background: color-mix(in srgb, var(--warp-rarity) 5%, var(--color-surface));
}
.warp-card-visual {
  position: relative;
  display: block;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border-radius: 6px 0 0 6px;
}
.warp-card-visual > :deep(.warp-visual) {
  position: absolute;
  inset: 0;
}
.warp-card-icons {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  min-width: 0;
  min-height: 0;
  padding: 8px 6px;
  border-left: 1px solid color-mix(in srgb, var(--warp-rarity) 28%, transparent);
}
.warp-icon-slot {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
}
.warp-card-icons :deep(.warp-icon) {
  max-width: 100%;
}
.warp-card-icons :deep(.warp-stars-icon) {
  width: 64px;
  height: 16px;
}
.warp-up {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 6px;
  border: 1px solid color-mix(in srgb, var(--warp-rarity) 50%, transparent);
  border-radius: 4px;
  background: var(--color-page);
  font-size: 11px;
  line-height: 1.2;
  color: var(--warp-rarity);
}
.warp-result-single {
  max-width: 620px;
}
.warp-result-single :deep(.warp-icon:not(.warp-stars-icon)) {
  width: clamp(24px, 5vw, 36px);
  height: clamp(24px, 5vw, 36px);
}
.warp-result-single :deep(.warp-stars-icon) {
  width: 84px;
  height: 20px;
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
