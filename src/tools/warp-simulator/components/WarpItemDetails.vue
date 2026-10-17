<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'
import WarpVisualIcon from './WarpVisualIcon.vue'
defineProps<{ entry?: HistoryEntry; item?: ItemPresentation; sourceLabel: string }>()
const emit = defineEmits<{ close: []; 'after-hide': [] }>()
const { t } = useI18n()
</script>

<template>
  <Dialog
    :visible="!!entry"
    modal
    :draggable="false"
    :header="item?.name ?? t('warp.details.title')"
    :style="{ width: '36rem', maxWidth: 'calc(100vw - 24px)' }"
    :close-button-props="{ 'aria-label': t('warp.details.close') }"
    @update:visible="
      (value) => {
        if (!value) emit('close')
      }
    "
    @after-hide="emit('after-hide')"
  >
    <div v-if="entry && item" class="warp-details">
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
  </Dialog>
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
