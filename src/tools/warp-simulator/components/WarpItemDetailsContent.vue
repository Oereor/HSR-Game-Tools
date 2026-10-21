<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'
import WarpVisualIcon from './WarpVisualIcon.vue'
defineProps<{ entry: HistoryEntry; item: ItemPresentation; sourceLabel: string }>()
const { t } = useI18n()
</script>
<template>
  <div class="warp-details">
    <div class="warp-details-art"><WarpItemVisual :item="item" artwork /></div>
    <dl>
      <dt>{{ t('warp.history.kind') }}</dt>
      <dd>{{ t(`warp.itemKind.${item.kind ?? 'unknown'}`) }}</dd>
      <dt>{{ t('warp.history.rarity') }}</dt>
      <dd>
        <WarpVisualIcon
          :url="item.starsUrl"
          :label="t('warp.visual.rarity', { count: entry.event.rarity })"
          stars
        />
      </dd>
      <dt>{{ t('warp.visual.path') }}</dt>
      <dd>
        <WarpVisualIcon
          :url="item.pathIconUrl"
          :label="item.pathName ?? t('warp.visual.unknown')"
        />{{ item.pathName ?? t('warp.visual.unknown') }}
      </dd>
      <template v-if="item.kind === 'avatar'"
        ><dt>{{ t('warp.visual.element') }}</dt>
        <dd :style="{ color: item.elementTextColor }">
          <WarpVisualIcon
            :url="item.elementIconUrl"
            :label="item.elementName ?? t('warp.visual.unknown')"
          />{{ item.elementName ?? t('warp.visual.unknown') }}
        </dd></template
      >
      <dt>{{ t('warp.details.source') }}</dt>
      <dd>{{ sourceLabel }}</dd>
      <template v-if="entry.event.isUp === true"
        ><dt>{{ t('warp.up') }}</dt>
        <dd>{{ t('warp.details.eventUp') }}</dd></template
      >
      <template v-if="entry.event.rarity === 5"
        ><dt>{{ t('warp.details.pity') }}</dt>
        <dd>{{ entry.event.pityBefore.pullsSinceLast5 + 1 }}</dd></template
      >
      <dt>{{ t('warp.details.record') }}</dt>
      <dd>#{{ entry.id }}</dd>
    </dl>
  </div>
</template>
<style scoped>
.warp-details-art {
  height: min(42dvh, 320px);
}
dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 12px 20px;
  font-size: 13px;
}
dt {
  color: var(--color-muted);
}
dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-wrap: anywhere;
}
</style>
