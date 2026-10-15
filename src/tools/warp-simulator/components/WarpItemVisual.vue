<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BookOpen, UserRound } from '@lucide/vue'
import type { ItemPresentation } from '../model/presentation'
import { useWarpPortrait } from '../composables/useWarpPortrait'
const props = defineProps<{ item: ItemPresentation }>()
const { t } = useI18n()
const { source, fail } = useWarpPortrait(() => props.item.portraitUrl)
</script>

<template>
  <span class="warp-visual">
    <img v-if="source" :src="source" :alt="item.name" width="256" height="256" @error="fail" />
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
