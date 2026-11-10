<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import type { ToolLocale } from '../../../locales/types'
import type { SkillPointsState } from '../engine/types'
import { formatNumber, formatSkillPointOutcome } from '../model/presentation'

const amount = defineModel<number>('amount')
const props = defineProps<{ preview?: SkillPointsState; invalid: boolean }>()
const { t, locale } = useI18n()
const presets = {
  none: 0,
  basic: 1,
  skill: -1,
  archerSkill: -2,
} as const
const presetOptions = computed(() =>
  Object.entries(presets).map(([key, amount]) => ({
    amount,
    label: t('planner.sp.presetOption', {
      name: t(`planner.sp.presets.${key}`),
      amount: formatNumber(amount, locale.value as ToolLocale, true),
    }),
  })),
)
const amountText = ref(amount.value?.toString() ?? '')
const amountInvalid = computed(() => !Number.isSafeInteger(amount.value) || props.invalid)
const outcome = computed(() =>
  formatSkillPointOutcome(props.preview, amount.value, locale.value as ToolLocale, t),
)
function setAmount(text: string) {
  amountText.value = text
  const trimmed = text.trim()
  const parsed = /^[+-]?\d+$/.test(trimmed) ? Number(trimmed) : NaN
  amount.value = Number.isSafeInteger(parsed) ? parsed : undefined
}
</script>

<template>
  <div class="field">
    <label for="sp-preset">{{ t('ui.presets') }}</label>
    <Select
      input-id="sp-preset"
      :model-value="amount"
      :options="presetOptions"
      option-label="label"
      option-value="amount"
      :placeholder="t('planner.sp.custom')"
      aria-describedby="sp-preset-hint"
      fluid
      @update:model-value="setAmount(String($event))"
    />
    <small id="sp-preset-hint" class="fine-print">{{ t('planner.sp.presetHint') }}</small>
  </div>
  <div class="field">
    <label for="sp-amount">{{ t('planner.sp.amount') }}</label>
    <InputText
      id="sp-amount"
      :model-value="amountText"
      :invalid="amountInvalid"
      :aria-describedby="amountInvalid ? 'sp-amount-error' : undefined"
      fluid
      @update:model-value="setAmount($event ?? '')"
    />
    <small v-if="amountInvalid" id="sp-amount-error" class="field-error">{{
      t('planner.sp.invalidAmount')
    }}</small>
    <small v-else-if="preview" class="fine-print" aria-live="polite">{{ outcome }}</small>
  </div>
</template>
