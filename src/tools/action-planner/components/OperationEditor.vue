<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import { ArrowLeft, Check } from '@lucide/vue'
import GameIcon from '../../../components/ui/GameIcon.vue'
import { sampleCharacters } from '../prototype/sample'
import { characterName } from '../../../data/adapters/game-data'
import type { ToolLocale } from '../../../locales/types'
import type { PrototypeDraft } from '../prototype/state'
const draft = defineModel<PrototypeDraft>({ required: true })
const props = defineProps<{ errors: string[] }>()
const emit = defineEmits<{ cancel: []; submit: [] }>()
const { t, locale } = useI18n()
const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
const options = (values: string[]) => values.map((value) => ({ label: t(`spike.${value}`), value }))
const types = computed(() => options(['speed', 'advance', 'delay', 'event']))
const modes = computed(() => options(['flat', 'percent']))
const durations = computed(() => options(['turns', 'countdown']))
const phases = computed(() => options(['preAction', 'postAction']))
const invalid = (key: string) => props.errors.includes(key)
const described = (key: string) => (invalid(key) ? `error-${key}` : undefined)
function toggleTarget(id: string) {
  draft.value.targets = draft.value.targets.includes(id)
    ? draft.value.targets.filter((x) => x !== id)
    : [...draft.value.targets, id]
}
</script>
<template>
  <form class="operation-editor" @submit.prevent="emit('submit')">
    <div class="editor-heading">
      <Button
        v-tooltip="t('spike.back')"
        text
        rounded
        severity="secondary"
        :aria-label="t('spike.back')"
        @click="emit('cancel')"
        ><ArrowLeft :size="18" :stroke-width="1.75"
      /></Button>
      <div>
        <span class="overline">{{ t('spike.editing') }}</span>
        <h2 ref="heading" tabindex="-1">{{ t('spike.edit') }}</h2>
      </div>
    </div>
    <div v-if="errors.length" role="alert" class="validation-summary">
      {{ t('spike.validation') }}
    </div>
    <div class="field">
      <span id="type-label" class="field-label">{{ t('spike.type') }}</span
      ><SelectButton
        size="small"
        v-model="draft.kind"
        :options="types"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="type-label"
        class="type-options"
      />
    </div>
    <fieldset
      v-if="draft.kind !== 'event'"
      class="target-field"
      :aria-describedby="described('targets')"
    >
      <legend>{{ t('spike.targets') }}</legend>
      <div class="target-grid">
        <button
          v-for="character in sampleCharacters"
          :key="character.id"
          type="button"
          class="target-button"
          :aria-pressed="draft.targets.includes(character.id)"
          @click="toggleTarget(character.id)"
        >
          <span class="target-portrait"
            ><GameIcon
              :asset-key="character.assetKey"
              :name="characterName(character, locale as ToolLocale)"
              :fallback="t('planner.imageMissing')" /><Check
              v-if="draft.targets.includes(character.id)"
              :size="14"
              class="target-check" /></span
          ><span>{{ characterName(character, locale as ToolLocale) }}</span>
        </button>
      </div>
      <small v-if="invalid('targets')" id="error-targets" class="field-error">{{
        t('spike.targetRequired')
      }}</small>
    </fieldset>
    <div v-if="draft.kind === 'speed'" class="field">
      <span id="mode-label" class="field-label">{{ t('spike.modifier') }}</span
      ><SelectButton
        size="small"
        v-model="draft.mode"
        :options="modes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="mode-label"
      />
    </div>
    <div v-if="draft.kind !== 'event'" class="field">
      <label for="effect-amount">{{ t('spike.amount') }}</label
      ><InputNumber
        v-model="draft.amount"
        input-id="effect-amount"
        :locale="locale"
        :use-grouping="false"
        :max-fraction-digits="2"
        :suffix="draft.kind !== 'speed' || draft.mode === 'percent' ? ' %' : ' SPD'"
        :invalid="invalid('amount')"
        :pt="{ pcInputText: { root: { 'aria-describedby': described('amount') } } }"
        fluid
      /><small v-if="invalid('amount')" id="error-amount" class="field-error">{{
        t('spike.invalidAmount')
      }}</small>
    </div>
    <template v-if="draft.kind === 'speed'">
      <div class="field">
        <span id="duration-label" class="field-label">{{ t('spike.duration') }}</span
        ><SelectButton
          size="small"
          v-model="draft.duration"
          :options="durations"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-labelledby="duration-label"
        />
      </div>
      <div v-if="draft.duration === 'turns'" class="field">
        <label for="duration-turns">{{ t('spike.turnCount') }}</label
        ><InputNumber
          v-model="draft.turns"
          input-id="duration-turns"
          :use-grouping="false"
          :invalid="invalid('turns')"
          :pt="{ pcInputText: { root: { 'aria-describedby': described('turns') } } }"
          fluid
        /><small v-if="invalid('turns')" id="error-turns" class="field-error">{{
          t('spike.invalidInteger')
        }}</small>
      </div>
      <div v-else class="form-grid">
        <div class="field">
          <label for="countdown-name">{{ t('spike.countdownName') }}</label
          ><InputText
            id="countdown-name"
            v-model="draft.countdownName"
            :invalid="invalid('countdownName')"
            :aria-describedby="described('countdownName')"
            fluid
          /><small v-if="invalid('countdownName')" id="error-countdownName" class="field-error">{{
            t('spike.required')
          }}</small>
        </div>
        <div class="field">
          <label for="countdown-speed">{{ t('spike.countdownSpeed') }}</label
          ><InputNumber
            v-model="draft.countdownSpeed"
            input-id="countdown-speed"
            :use-grouping="false"
            :max-fraction-digits="2"
            :invalid="invalid('countdownSpeed')"
            :pt="{ pcInputText: { root: { 'aria-describedby': described('countdownSpeed') } } }"
            fluid
          /><small v-if="invalid('countdownSpeed')" id="error-countdownSpeed" class="field-error">{{
            t('spike.invalidNumber')
          }}</small>
        </div>
      </div>
    </template>
    <div v-if="draft.kind === 'event'" class="form-grid">
      <div class="field">
        <label for="event-name">{{ t('spike.eventName') }}</label
        ><InputText
          id="event-name"
          v-model="draft.eventName"
          :placeholder="t('spike.demoName')"
          :invalid="invalid('eventName')"
          :aria-describedby="described('eventName')"
          fluid
        /><small v-if="invalid('eventName')" id="error-eventName" class="field-error">{{
          t('spike.required')
        }}</small>
      </div>
      <div class="field">
        <label for="event-speed">{{ t('spike.eventSpeed') }}</label
        ><InputNumber
          v-model="draft.eventSpeed"
          input-id="event-speed"
          :use-grouping="false"
          :max-fraction-digits="2"
          :invalid="invalid('eventSpeed')"
          :pt="{ pcInputText: { root: { 'aria-describedby': described('eventSpeed') } } }"
          fluid
        /><small v-if="invalid('eventSpeed')" id="error-eventSpeed" class="field-error">{{
          t('spike.invalidNumber')
        }}</small>
      </div>
    </div>
    <div class="field">
      <span id="phase-label" class="field-label">{{ t('spike.phase') }}</span
      ><SelectButton
        size="small"
        v-model="draft.phase"
        :options="phases"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="phase-label"
      />
    </div>
    <footer class="editor-footer">
      <span class="fine-print">{{ t('spike.localOnly') }}</span>
      <div class="editor-actions">
        <Button
          text
          severity="secondary"
          :label="t('spike.cancel')"
          @click="emit('cancel')"
        /><Button type="submit" :label="t('spike.submit')" />
      </div>
    </footer>
  </form>
</template>
