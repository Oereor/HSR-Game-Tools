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
    <span class="warp-card-visual"><WarpItemVisual :item="item" artwork /></span>
    <span class="warp-card-icons">
      <span v-if="entry.event.isUp === true" class="warp-up">{{ t('warp.up') }}</span>
      <WarpVisualIcon
        v-tooltip="item.pathName ?? t('warp.visual.unknown')"
        :url="item.pathIconUrl"
        :label="item.pathName ?? t('warp.visual.unknown')"
      />
      <WarpVisualIcon
        v-if="item.kind === 'avatar'"
        v-tooltip="item.elementName ?? t('warp.visual.unknown')"
        :url="item.elementIconUrl"
        :label="item.elementName ?? t('warp.visual.unknown')"
      />
      <WarpVisualIcon
        :url="item.starsUrl"
        :label="t('warp.visual.rarity', { count: entry.event.rarity })"
        stars
      />
    </span>
  </Button>
</template>

<style scoped>
.warp-result-card {
  --warp-rarity: var(--p-warp-rarity-3);
  --warp-glow: 12%;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  align-items: stretch;
  width: 100%;
  aspect-ratio: 2 / 1;
  min-width: 0;
  min-height: 136px;
  padding: 0;
  overflow: hidden;
  color: var(--color-ink);
  border: 2px solid var(--warp-rarity);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow:
    0 0 14px color-mix(in srgb, var(--warp-rarity) var(--warp-glow), transparent),
    inset 0 0 8px color-mix(in srgb, var(--warp-rarity) 10%, transparent);
  animation: warp-result-in 180ms ease-out both;
  animation-delay: var(--warp-delay);
}
.warp-rarity-4 {
  --warp-rarity: var(--p-warp-rarity-4);
  --warp-glow: 26%;
}
.warp-rarity-5 {
  --warp-rarity: var(--p-warp-rarity-5);
  --warp-glow: 38%;
}
.warp-result-card:hover {
  background: color-mix(in srgb, var(--warp-rarity) 5%, var(--color-surface));
}
.warp-card-visual {
  display: block;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.warp-card-icons {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 4px;
  border-left: 1px solid color-mix(in srgb, var(--warp-rarity) 28%, transparent);
}
.warp-card-icons :deep(.warp-stars-icon) {
  width: 64px;
  height: 16px;
}
.warp-up {
  font-size: 10px;
  line-height: 1.1;
  color: var(--warp-rarity);
}
.warp-result-single {
  max-width: 620px;
  grid-template-columns: minmax(0, 1fr) 100px;
}
.warp-result-single .warp-card-icons {
  gap: 18px;
}
.warp-result-single :deep(.warp-icon:not(.warp-stars-icon)) {
  width: 36px;
  height: 36px;
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
