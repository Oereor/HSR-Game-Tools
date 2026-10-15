<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'
import { CircleCheck } from '@lucide/vue'
import type { PityState } from '../engine/types'
import { pityRows } from '../model/presentation'
const props = defineProps<{ pity: PityState; hasUp5: boolean; hasUp4: boolean }>()
const { t } = useI18n()
const rows = computed(() => pityRows(props.pity, props.hasUp5, props.hasUp4))
</script>

<template>
  <div class="warp-pity" :aria-label="t('warp.pity.title')">
    <div v-for="row in rows" :key="row.key" class="warp-pity-row">
      <template v-if="'status' in row">
        <span>{{ t(`warp.pity.${row.key}`) }}</span>
        <Tag
          :severity="row.status === 'guaranteed' ? 'success' : 'secondary'"
          :value="t(`warp.pity.${row.status}`)"
        >
          <template #icon
            ><CircleCheck
              v-if="row.status !== 'unavailable'"
              :size="14"
              :stroke-width="1.75"
              aria-hidden="true"
          /></template>
        </Tag>
      </template>
      <span
        v-else
        :title="'pending' in row && row.pending ? t('warp.pity.pendingHint') : undefined"
      >
        {{
          t('pending' in row && row.pending ? 'warp.pity.fourPending' : `warp.pity.${row.key}`, {
            count: row.count,
          })
        }}
      </span>
    </div>
    <p v-if="pity.pullsSinceLast4 === 9" class="warp-pending-hint">
      {{ t('warp.pity.pendingHint') }}
    </p>
  </div>
</template>

<style scoped>
.warp-pity {
  padding: 14px 0;
  border-top: 1px solid var(--color-line);
  border-bottom: 1px solid var(--color-line);
}
.warp-pity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.warp-pending-hint {
  margin: 6px 0 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
