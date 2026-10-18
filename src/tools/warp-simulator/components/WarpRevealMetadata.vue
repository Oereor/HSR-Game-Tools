<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ItemPresentation } from '../model/presentation'
import WarpVisualIcon from './WarpVisualIcon.vue'
import { revealMetadata } from './reveal-metadata'

const props = defineProps<{ item: ItemPresentation; rarity: 3 | 4 | 5; descriptionId: string }>()
const { t } = useI18n()
const metadata = computed(() => revealMetadata(props.item, props.rarity, t))
</script>

<template>
  <span class="warp-reveal-metadata">
    <span
      class="warp-reveal-metadata-name"
      :style="{ color: metadata.nameColor }"
      aria-hidden="true"
      >{{ metadata.name }}</span
    >
    <span class="warp-reveal-metadata-rarity" aria-hidden="true">
      <WarpVisualIcon
        :image="metadata.stars"
        :reference-aspect-ratio="metadata.starsReferenceAspectRatio"
        :label="metadata.rarityLabel"
        stars
      />
    </span>
    <span class="warp-reveal-metadata-details" aria-hidden="true">
      <span
        v-for="group in metadata.groups"
        :key="group.kind"
        class="warp-reveal-metadata-group"
        :style="{ color: group.color }"
      >
        <WarpVisualIcon :url="group.icon" :label="group.name" />
        <span class="warp-reveal-metadata-label">{{ group.name }}</span>
      </span>
      <span v-if="!metadata.groups.length">{{ metadata.unknown }}</span>
    </span>
    <span :id="descriptionId" class="warp-reveal-metadata-summary">{{ metadata.description }}</span>
  </span>
</template>

<style scoped>
.warp-reveal-metadata {
  --warp-icon-size: 22px;
  --warp-stars-target-height: 22px;
  --warp-icon-align: start;
  --warp-icon-position: left center;
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  box-sizing: border-box;
  width: min(360px, calc(100% - 32px));
  min-width: 0;
  padding: 16px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.75);
  color: var(--color-ink);
  font-size: 14px;
  line-height: 1.4;
  text-align: left;
  overflow-wrap: anywhere;
  pointer-events: none;
  container-type: inline-size;
}
.warp-reveal-metadata-name {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.25;
}
.warp-reveal-metadata-rarity {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  justify-items: start;
  min-width: 0;
}
.warp-reveal-metadata-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  min-width: 0;
}
.warp-reveal-metadata-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}
.warp-reveal-metadata-label {
  min-width: 0;
}
.warp-reveal-metadata-summary {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 640px), (max-height: 480px) {
  .warp-reveal-metadata {
    --warp-icon-size: 20px;
    --warp-stars-target-height: 18px;
    left: 12px;
    bottom: 12px;
    width: min(320px, calc(100% - 24px));
    padding: 12px;
    font-size: 13px;
  }
  .warp-reveal-metadata-name {
    font-size: 20px;
  }
  .warp-reveal-metadata-details {
    column-gap: 12px;
  }
}
</style>
