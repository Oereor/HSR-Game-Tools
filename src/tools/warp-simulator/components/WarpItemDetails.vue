<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'
import WarpItemDetailsContent from './WarpItemDetailsContent.vue'
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
    <WarpItemDetailsContent
      v-if="entry && item"
      :entry="entry"
      :item="item"
      :source-label="sourceLabel"
    />
  </Dialog>
</template>
