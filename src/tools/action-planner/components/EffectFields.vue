<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectButton from 'primevue/selectbutton'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import type { OperationDraft } from '../model/editor'
const draft = defineModel<OperationDraft>({ required: true })
const props = defineProps<{ invalid: string[] }>()
const { t, locale } = useI18n()
const options = (values: string[]) => values.map((value) => ({ value, label: t(`ui.${value}`) }))
const modes = computed(() => options(['flat', 'percent']))
const durations = computed(() => options(['turns', 'countdown']))
const bad = (key: string) => props.invalid.includes(key)
const pt = (key: string) => ({
  pcInputText: { root: { 'aria-describedby': bad(key) ? `error-${key}` : undefined } },
})
</script>
<template>
  <div v-if="draft.type === 'advance' || draft.type === 'delay'" class="field">
    <label for="effect-percent">{{ t('ui.percentValue') }}</label
    ><InputNumber
      v-model="draft.percent"
      input-id="effect-percent"
      :locale="locale"
      :max-fraction-digits="20"
      :use-grouping="false"
      :suffix="t('common.percentSuffix')"
      :invalid="bad('percent')"
      :pt="pt('percent')"
      fluid
    /><small v-if="bad('percent')" id="error-percent" class="field-error">{{
      t('ui.nonnegative')
    }}</small>
  </div>
  <template v-if="draft.type === 'addSpeedModifier'">
    <div class="field">
      <span id="mode-label" class="field-label">{{ t('ui.modifier') }}</span
      ><SelectButton
        v-model="draft.mode"
        size="small"
        :options="modes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="mode-label"
      />
    </div>
    <div class="field">
      <label for="effect-amount">{{ t('ui.amount') }}</label
      ><InputNumber
        v-model="draft.amount"
        input-id="effect-amount"
        :locale="locale"
        :max-fraction-digits="20"
        :use-grouping="false"
        :suffix="t(draft.mode === 'percent' ? 'common.percentSuffix' : 'common.speedSuffix')"
        :invalid="bad('amount')"
        :pt="pt('amount')"
        fluid
      /><small v-if="bad('amount')" id="error-amount" class="field-error">{{
        t('ui.finite')
      }}</small>
    </div>
    <div class="field">
      <span id="duration-label" class="field-label">{{ t('ui.duration') }}</span
      ><SelectButton
        v-model="draft.duration.kind"
        size="small"
        :options="durations"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="duration-label"
      />
    </div>
    <div v-if="draft.duration.kind === 'turns'" class="field">
      <label for="duration-turns">{{ t('ui.turnCount') }}</label
      ><InputText
        id="duration-turns"
        v-model="draft.duration.turns"
        inputmode="numeric"
        :placeholder="t('ui.unlimited')"
        :invalid="bad('turns')"
        :aria-describedby="bad('turns') ? 'error-turns' : undefined"
        fluid
      /><small v-if="bad('turns')" id="error-turns" class="field-error">{{
        t('ui.integer')
      }}</small>
    </div>
    <div v-else class="form-grid">
      <div class="field">
        <label for="countdown-name">{{ t('ui.countdownName') }}</label
        ><InputText
          id="countdown-name"
          v-model="draft.duration.countdownName"
          :invalid="bad('countdownName')"
          :aria-describedby="bad('countdownName') ? 'error-countdownName' : undefined"
          fluid
        /><small v-if="bad('countdownName')" id="error-countdownName" class="field-error">{{
          t('ui.required')
        }}</small>
      </div>
      <div class="field">
        <label for="countdown-speed">{{ t('ui.countdownSpeed') }}</label
        ><InputNumber
          v-model="draft.duration.countdownSpeed"
          input-id="countdown-speed"
          :locale="locale"
          :use-grouping="false"
          :max-fraction-digits="20"
          :invalid="bad('countdownSpeed')"
          :pt="pt('countdownSpeed')"
          fluid
        /><small v-if="bad('countdownSpeed')" id="error-countdownSpeed" class="field-error">{{
          t('ui.positive')
        }}</small>
      </div>
    </div>
  </template>
</template>
