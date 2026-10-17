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
  width: 24px;
  height: 24px;
  vertical-align: middle;
}
.warp-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.warp-stars-icon {
  width: 80px;
  height: 18px;
}
.warp-icon-missing {
  color: var(--color-muted);
}
</style>
