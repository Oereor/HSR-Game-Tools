<script setup lang="ts">
import { useImageSource } from '../../../composables/useImageSource'
const props = defineProps<{ url?: string; label: string; stars?: boolean }>()
const { source, fail } = useImageSource(() => props.url)
</script>

<template>
  <span class="warp-icon" :class="{ 'warp-stars-icon': stars }" role="img" :aria-label="label">
    <img v-if="source" :src="source" alt="" @error="fail" />
    <span v-else aria-hidden="true" class="warp-icon-missing">—</span>
  </span>
</template>

<style scoped>
.warp-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: min(var(--warp-icon-size, 24px), 100%);
  height: min(var(--warp-icon-size, 24px), 100%);
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  justify-self: var(--warp-icon-align, center);
  vertical-align: middle;
}
.warp-icon img {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  object-fit: contain;
  object-position: var(--warp-icon-position, center);
}
.warp-stars-icon {
  width: min(var(--warp-stars-width, 80px), 100%);
  height: auto;
  aspect-ratio: 5 / 1;
}
.warp-icon-missing {
  color: var(--color-muted);
}
</style>
