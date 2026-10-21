<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolLocale } from '../../../locales/types'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { createPresentation } from '../model/presentation'
import { resultWall, fitResultWall, wallCard } from '../model/result-wall'
import { useWarpElementSize } from '../composables/useWarpElementSize'
import WarpResultCard from './WarpResultCard.vue'

defineProps<{
  entries: readonly HistoryEntry[]
  presentation: ReturnType<typeof createPresentation>
}>()
const emit = defineEmits<{ details: [entry: HistoryEntry] }>()
const { locale, t } = useI18n()
const frame = ref<HTMLElement>()
const size = useWarpElementSize(frame)
const scale = computed(() => fitResultWall(size.value.width, size.value.height))
</script>
<template>
  <div ref="frame" class="warp-wall-viewport" :aria-label="t('warp.results.title')">
    <div
      class="warp-wall-canvas"
      :style="{
        width: `${resultWall.width}px`,
        height: `${resultWall.height}px`,
        '--wall-scale': scale,
      }"
    >
      <div
        v-for="(entry, index) in entries"
        :key="`${entry.batchId}:${entry.id}`"
        class="warp-wall-slot"
        :style="{
          left: `${resultWall.slots[index]!.left}px`,
          top: `${resultWall.slots[index]!.top}px`,
          width: `${wallCard.width}px`,
          zIndex: resultWall.slots[index]!.zIndex,
        }"
      >
        <WarpResultCard
          :entry="entry"
          :item="presentation.item(entry.event.itemId, locale as ToolLocale)"
          :index="index"
          :single="false"
          id-prefix="warp-overview-result"
          @details="emit('details', $event)"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.warp-wall-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.warp-wall-canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(var(--wall-scale));
  transform-origin: center;
}
.warp-wall-slot {
  position: absolute;
  transform: rotate(-12deg);
}
.warp-wall-slot:focus-within,
.warp-wall-slot:hover {
  z-index: 20 !important;
}
@media (max-width: 1039px), (max-height: 639px) {
  .warp-wall-viewport {
    overflow: auto;
    overscroll-behavior: contain;
  }
  .warp-wall-canvas {
    position: relative;
    left: auto;
    top: auto;
    width: 100% !important;
    height: auto !important;
    transform: none;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 38px 28px;
    padding: 36px;
  }
  .warp-wall-slot {
    position: relative;
    left: auto !important;
    top: auto !important;
    width: 100% !important;
    transform: rotate(-4deg);
  }
}
@media (max-width: 640px) {
  .warp-wall-canvas {
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
    padding: 30px 22px;
  }
  .warp-wall-slot {
    transform: rotate(-3deg);
  }
}
</style>
