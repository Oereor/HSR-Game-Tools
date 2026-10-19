<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HTabs, HTabPanels } from 'astral-ui/components'
import CurrencyCandidateResults from './CurrencyCandidateResults.vue'
import type { Snapshot } from '../types'
import type { SolvedAttempt } from '../ui/session'
import type { VisualCatalog } from '../ui/visuals'
import type { CurrencyWarsCraftCatalog } from '../ui/crafting'
const props = defineProps<{
  snapshot: Snapshot
  catalog: VisualCatalog
  crafts: CurrencyWarsCraftCatalog
  attempt: SolvedAttempt
  selectedIndex: number
  stale: boolean
  historical: boolean
}>()
const emit = defineEmits<{ select: [index: number] }>()
const { t } = useI18n()
const tabs = computed(() =>
  props.attempt.result.solutions.map((_, index) => ({
    value: String(index),
    label: t('currencyWars.result.solution', { index: index + 1 }),
  })),
)
</script>
<template>
  <div class="currency-result-batch">
    <p v-if="stale" class="currency-notice currency-notice--warning">
      {{ t('currencyWars.result.stale') }}
    </p>
    <p v-else-if="historical" class="currency-notice">{{ t('currencyWars.result.historical') }}</p>
    <HTabs
      v-if="tabs.length > 1"
      :model-value="String(selectedIndex)"
      :items="tabs"
      :label="t('currencyWars.result.chooseSolution')"
      id-prefix="currency-candidates"
      variant="pill"
      @update:model-value="emit('select', Number($event))"
    />
    <HTabPanels
      :value="String(selectedIndex)"
      :order="tabs.map((tab) => tab.value)"
      :id-prefix="tabs.length > 1 ? 'currency-candidates' : undefined"
      :animated="false"
      :animate-height="false"
    >
      <template #default="{ value }">
        <CurrencyCandidateResults
          :key="`${attempt.requestId}-${value}`"
          :snapshot="snapshot"
          :catalog="catalog"
          :crafts="crafts"
          :attempt="attempt"
          :solution="attempt.result.solutions[Number(value)]"
        />
      </template>
    </HTabPanels>
  </div>
</template>
<style scoped>
.currency-result-batch {
  display: grid;
  gap: 20px;
  min-width: 0;
}
</style>
