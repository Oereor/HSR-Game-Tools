<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BookOpen, UserRound } from '@lucide/vue'
import type { ItemPresentation } from '../model/presentation'
import { useWarpPortrait } from '../composables/useWarpPortrait'
const props = defineProps<{ item: ItemPresentation; artwork?: boolean }>()
const { t } = useI18n()
const { source, fail } = useWarpPortrait(() =>
  props.artwork ? props.item.artworkUrl : (props.item.portraitUrl ?? props.item.artworkUrl),
)
</script>

<template>
  <span
    class="warp-visual"
    :class="{ 'warp-artwork': artwork, 'warp-cone': item.kind === 'light-cone' }"
  >
    <img v-if="source" :src="source" :alt="item.name" @error="fail" />
    <span
      v-else
      class="warp-visual-fallback"
      role="img"
      :aria-label="t('warp.visual.missingImage', { name: item.name })"
    >
      <BookOpen
        v-if="item.kind === 'light-cone'"
        :size="36"
        :stroke-width="1.25"
        aria-hidden="true"
      />
      <UserRound v-else :size="36" :stroke-width="1.25" aria-hidden="true" />
    </span>
  </span>
</template>

<style scoped>
.warp-visual {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}
.warp-artwork.warp-cone {
  padding: 8px 12px;
}
.warp-artwork:not(.warp-cone) img {
  object-position: center;
}
.warp-cone img {
  object-position: center;
}
img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.warp-visual-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 40px;
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 6%, transparent);
  border-radius: 6px;
}
</style>
