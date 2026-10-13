<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import Popover from 'primevue/popover'
import { ArrowLeft, Layers } from '@lucide/vue'
import GameIcon from '../../../components/ui/GameIcon.vue'
import TargetGrid from './TargetGrid.vue'
import EffectFields from './EffectFields.vue'
import ParticipantFields from './ParticipantFields.vue'
import { gameData } from '../../../data/adapters/game-data'
import type {
  EffectOperation,
  EventAnchor,
  ParticipantInfo,
  SimulationState,
} from '../../../engine/action-planner/types'
import type { OperationDraft } from '../model/editor'
import { provisionalOperation, operationDraft } from '../model/editor'
import { operationName } from '../model/naming'
import { canUseVonwacq, presetOperation, type PresetKind } from '../model/presets'
import type { ToolLocale } from '../../../locales/types'
const draft = defineModel<OperationDraft>({ required: true })
const props = defineProps<{
  anchor: EventAnchor
  participants: ParticipantInfo[]
  preview?: SimulationState
  invalid: string[]
  label: (id: string) => string
  image: (id: string) => string | undefined
}>()
const emit = defineEmits<{ cancel: []; submit: [] }>()
const { t, locale } = useI18n()
const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
const types = computed(() =>
  ['advance', 'delay', 'immediatelyAct', 'addSpeedModifier', 'spawnParticipant'].map((value) => ({
    value,
    label: t(`ui.${value}`),
  })),
)
const phases = computed(() =>
  ['preAction', 'postAction'].map((value) => ({ value, label: t(`ui.${value}`) })),
)
const provisional = computed(() => provisionalOperation(draft.value, props.anchor))
const automaticName = computed(() =>
  provisional.value
    ? operationName(provisional.value, locale.value as ToolLocale, props.label, props.preview)
    : t(`ui.${draft.value.type}`),
)
const popover = ref<InstanceType<typeof Popover>>()
function preset(kind: PresetKind) {
  const actor = props.participants.find((p) => p.kind === 'actor')
  const phase = draft.value.phase
  const op: EffectOperation = {
    ...presetOperation(kind, '', actor?.id ?? ''),
    ...(props.anchor.kind === 'action' ? { phase } : {}),
  }
  const next = operationDraft(op)
  next.id = undefined
  next.original = undefined
  draft.value = next
  popover.value?.hide()
}
</script>
<template>
  <form class="operation-editor" @submit.prevent="emit('submit')">
    <div class="editor-heading">
      <Button
        v-tooltip="t('ui.back')"
        text
        rounded
        severity="secondary"
        :aria-label="t('ui.back')"
        @click="emit('cancel')"
        ><ArrowLeft :size="18" :stroke-width="1.75"
      /></Button>
      <h2 ref="heading" tabindex="-1">{{ draft.id ? t('ui.edit') : t('ui.add') }}</h2>
      <Button
        v-if="!draft.id"
        text
        severity="secondary"
        size="small"
        class="preset-trigger"
        @click="popover?.toggle($event)"
        ><Layers :size="16" :stroke-width="1.75" />{{ t('ui.presets') }}</Button
      >
    </div>
    <p v-if="invalid.includes('form')" role="alert" class="validation-summary">
      {{ t('ui.formInvalid') }}
    </p>
    <p v-if="!preview" class="validation-summary" role="status">{{ t('ui.contextUnavailable') }}</p>
    <div class="field">
      <span id="type-label" class="field-label">{{ t('ui.type') }}</span
      ><SelectButton
        v-model="draft.type"
        size="small"
        :options="types"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        :disabled="draft.original?.type === 'spawnParticipant'"
        aria-labelledby="type-label"
        class="type-options"
      />
    </div>
    <div v-if="anchor.kind === 'action'" class="field">
      <span id="phase-label" class="field-label">{{ t('ui.phase') }}</span
      ><SelectButton
        v-model="draft.phase"
        size="small"
        :options="phases"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="phase-label"
      />
    </div>
    <ParticipantFields
      v-if="draft.type === 'spawnParticipant'"
      v-model="draft"
      :invalid="invalid"
    />
    <template v-else
      ><TargetGrid
        v-model="draft"
        :participants="participants"
        :label="label"
        :image="image"
        :invalid="invalid.includes('target')" /><EffectFields v-model="draft" :invalid="invalid"
    /></template>
    <div class="field">
      <label for="custom-name">{{ t('ui.customName') }}</label
      ><InputText id="custom-name" v-model="draft.customName" :placeholder="automaticName" fluid />
    </div>
    <footer class="editor-footer">
      <div class="editor-actions">
        <Button text severity="secondary" :label="t('ui.cancel')" @click="emit('cancel')" /><Button
          type="submit"
          :label="t('ui.applyOperation')"
          :disabled="!preview"
        />
      </div>
    </footer>
    <Popover ref="popover" :pt="{ root: { 'aria-label': t('ui.presets') } }"
      ><div class="preset-list">
        <button
          v-for="p in gameData.presets"
          :key="p.id"
          type="button"
          class="preset-option"
          :disabled="p.kind === 'vonwacq' && !canUseVonwacq(anchor)"
          :title="p.kind === 'vonwacq' && !canUseVonwacq(anchor) ? t('ui.startOnly') : undefined"
          @click="preset(p.kind)"
        >
          <GameIcon
            :asset-key="p.assetKey"
            :name="p.names[locale as ToolLocale]"
            :fallback="t('planner.imageMissing')"
          /><span>{{ p.names[locale as ToolLocale] }}</span
          ><small>{{ p.kind === 'dance' ? '24%' : p.kind === 'vonwacq' ? '40%' : '25%' }}</small>
        </button>
      </div></Popover
    >
  </form>
</template>
