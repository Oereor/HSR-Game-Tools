<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import Popover from 'primevue/popover'
import Message from 'primevue/message'
import { ArrowLeft, Layers } from '@lucide/vue'
import GameIcon from './GameIcon.vue'
import TargetGrid from './TargetGrid.vue'
import EffectFields from './EffectFields.vue'
import ParticipantFields from './ParticipantFields.vue'
import SkillPointFields from './SkillPointFields.vue'
import { gameData } from '../data/adapters/game-data'
import type {
  CharacterEffectId,
  EventAnchor,
  ParticipantInfo,
  SimulationState,
  SkillPointWarning,
} from '../engine/types'
import type { OperationDraft } from '../model/editor'
import { provisionalOperation } from '../model/editor'
import { operationName, formatNumber } from '../model/presentation'
import { characterEffectNameKey } from '../model/naming'
import {
  CHARACTER_EFFECT_IDS,
  ENHANCED_BASIC_COSTS,
  characterEffectSourceIssue,
} from '../engine/character-effects'
import { isSkillPointOperationType } from '../engine/effect-config'
import { presets, presetIcon } from '../presets/catalog'
import {
  collectInputs,
  isCharacterEffectPreset,
  selectionOperation,
  valueResolver,
} from '../presets/values'
import { operationTargets } from '../engine/targeting'
import type { Input, PresetDefinition, PresetRequest, Translate } from '../presets/types'
import type { ToolLocale } from '../../../locales/types'
const draft = defineModel<OperationDraft>({ required: true })
const props = defineProps<{
  anchor: EventAnchor
  participants: ParticipantInfo[]
  preview?: SimulationState
  skillPointWarning?: SkillPointWarning
  invalid: string[]
  presetIssues: Record<string, string | undefined>
  label: (id: string) => string
  image: (id: string) => string | undefined
}>()
const emit = defineEmits<{ cancel: []; submit: []; preset: [request: PresetRequest] }>()
const { t, locale } = useI18n()
const translate: Translate = (key, params) => (params ? t(key, params) : t(key))
const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
const skillPointDraft = computed(() => isSkillPointOperationType(draft.value.type))
const manualDraft = computed(() => draft.value.type === 'changeSkillPoints')
const presetLabel = computed(() =>
  t(skillPointDraft.value ? 'planner.characterEffects.presets' : 'ui.presets'),
)
const effectSources = computed(() => {
  const state = props.preview
  return CHARACTER_EFFECT_IDS.map((effectId) => ({
    effectId,
    sources: state?.skillPoints
      ? [...(state.characterEffects?.keys() ?? [])].filter(
          (sourceParticipantId) =>
            !characterEffectSourceIssue(state, { effectId, sourceParticipantId }, props.anchor),
        )
      : [],
  }))
})
const effectOptions = computed(() =>
  effectSources.value
    .filter(({ effectId, sources }) => sources.length || effectId === draft.value.effectId)
    .map(({ effectId }) => ({ value: effectId, label: t(characterEffectNameKey(effectId)) })),
)
const sourceOptions = computed(() => {
  const sources = effectSources.value.find(({ effectId }) => effectId === draft.value.effectId)
  const ids = sources?.sources ?? []
  const current = draft.value.sourceParticipantId
  return [
    ...ids.map((value) => ({ value, label: props.label(value), disabled: false })),
    ...(current && !ids.includes(current)
      ? [{ value: current, label: props.label(current), disabled: true }]
      : []),
  ]
})
function selectEffect(effectId?: CharacterEffectId) {
  if (effectId !== draft.value.effectId) {
    draft.value.effectCost = effectId === 'imbibitorLunae.enhancedBasic' ? 1 : undefined
  }
  draft.value.effectId = effectId
  const sources = effectSources.value.find((item) => item.effectId === effectId)?.sources
  draft.value.sourceParticipantId = sources?.length === 1 ? sources[0] : undefined
}
const enhancements = computed(() =>
  ENHANCED_BASIC_COSTS.map((value) => ({
    value,
    label: t(`planner.characterEffects.enhancement${value}`),
  })),
)
const types = computed(() =>
  (skillPointDraft.value
    ? ['changeSkillPoints', ...(effectOptions.value.length ? ['characterEffect'] : [])]
    : [
        'advance',
        'delay',
        'immediatelyAct',
        'addSpeedModifier',
        'spawnParticipant',
        'depart',
        'returnToField',
      ]
  ).map((value) => ({ value, label: t(`ui.${value}`) })),
)
const phases = computed(() =>
  ['preAction', 'postAction'].map((value) => ({ value, label: t(`ui.${value}`) })),
)
const provisional = computed(() =>
  manualDraft.value && !Number.isSafeInteger(draft.value.amount)
    ? undefined
    : provisionalOperation(draft.value, props.anchor),
)
const automaticName = computed(() =>
  provisional.value
    ? operationName(provisional.value, locale.value as ToolLocale, t, props.label, props.preview)
    : t(`ui.${draft.value.type}`),
)
const popover = ref<InstanceType<typeof Popover>>()
const selectedPreset = ref<PresetDefinition>()
const values = ref<Record<string, string | number | undefined>>({})
watch(draft, () => {
  selectedPreset.value = undefined
  values.value = {}
})
const availablePresets = computed(() =>
  presets.filter((preset) => {
    if (!isCharacterEffectPreset(preset)) return !skillPointDraft.value
    const issue = props.presetIssues[preset.id]
    return (
      skillPointDraft.value &&
      (!issue ||
        issue === 'activeTarget' ||
        (issue === 'ambiguous' &&
          effectSources.value.some(
            ({ effectId, sources }) =>
              sources.length &&
              preset.operations.some(
                (op) => op.type === 'characterEffect' && op.effectId === effectId,
              ),
          )))
    )
  }),
)
const inputs = computed(() => (selectedPreset.value ? collectInputs(selectedPreset.value) : []))
const selection = computed(() => selectedPreset.value && selectionOperation(selectedPreset.value))
const selectionTargets = computed(() =>
  selection.value?.nested
    ? [
        ...operationTargets(props.preview, 'depart'),
        ...operationTargets(props.preview, 'returnToField'),
      ]
    : operationTargets(props.preview, selection.value?.type),
)
const numberValue = (id: string) =>
  typeof values.value[id] === 'number' ? (values.value[id] as number) : undefined
const stringValue = (id: string) =>
  typeof values.value[id] === 'string' ? (values.value[id] as string) : undefined
function issueMessage(preset: PresetDefinition, issue?: string): string | undefined {
  if (!issue) return undefined
  if (issue === 'startOnly') return t('ui.startOnly')
  if (issue === 'ambiguous' && isCharacterEffectPreset(preset))
    return t('planner.characterEffects.ambiguous')
  const key = preset.i18n.unavailable?.[issue]
  return key
    ? t(key)
    : issue === 'context'
      ? t('ui.contextUnavailable')
      : t(
          `planner.presetErrors.${['depth', 'operations', 'inputs', 'value-depth', 'onTrigger', 'parameter-reference', 'speed', 'character-stat', 'self-stat'].includes(issue) ? issue : 'form'}`,
        )
}
const presetError = computed(() =>
  selectedPreset.value
    ? issueMessage(
        selectedPreset.value,
        props.presetIssues[selectedPreset.value.id] ??
          props.invalid.find((issue) => !inputs.value.some((input) => input.id === issue)),
      )
    : undefined,
)
const summaries = computed(() => {
  if (!selectedPreset.value) return []
  try {
    const resolver = valueResolver(
      selectedPreset.value,
      gameData.characters,
      translate,
      values.value,
    )
    return (selectedPreset.value.previews ?? []).map((preview) =>
      t(
        preview.key,
        Object.fromEntries(
          Object.entries(preview.params).map(([key, value]) => {
            const resolved = resolver.resolve(value)
            return [
              key,
              typeof resolved === 'number'
                ? formatNumber(resolved, locale.value as ToolLocale)
                : (resolved ?? ''),
            ]
          }),
        ),
      ),
    )
  } catch {
    return []
  }
})
const eventTarget = computed(
  () =>
    draft.value.type === 'addSpeedModifier' &&
    draft.value.targetKind === 'participants' &&
    props.participants.some(
      (p) => p.kind === 'scheduledEvent' && draft.value.selectedIds.includes(p.id),
    ),
)
function choose(preset: PresetDefinition) {
  const issue = props.presetIssues[preset.id]
  if (issue) return
  popover.value?.hide()
  if (preset.interaction === 'draft' && !collectInputs(preset).length) {
    emit('preset', { id: preset.id, values: {}, translate })
    return
  }
  selectedPreset.value = preset
  if (!collectInputs(preset).length && !selectionOperation(preset)) {
    emit('preset', { id: preset.id, values: {}, translate })
    return
  }
  const resolver = valueResolver(preset, gameData.characters, translate)
  values.value = Object.fromEntries(
    collectInputs(preset).map((input) => [input.id, resolver.resolve(input) as string | number]),
  )
}
function inputError(input: Input) {
  return input.exclusiveMinimum === 0
    ? t('ui.positive')
    : input.minimum === 0
      ? t('ui.nonnegative')
      : t('ui.formInvalid')
}
const submitDisabled = computed(() =>
  selectedPreset.value
    ? !props.preview || !!props.presetIssues[selectedPreset.value.id]
    : manualDraft.value
      ? !Number.isSafeInteger(draft.value.amount) || (!props.preview && !draft.value.id)
      : draft.value.type === 'characterEffect'
        ? !provisional.value || (!props.preview && !draft.value.id)
        : !props.preview,
)
function submit() {
  if (submitDisabled.value) return
  if (selectedPreset.value)
    emit('preset', {
      id: selectedPreset.value.id,
      values: values.value,
      translate,
    })
  else emit('submit')
}
</script>
<template>
  <form class="operation-editor" @submit.prevent="submit">
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
      <h2 ref="heading" tabindex="-1">
        {{ selectedPreset ? t(selectedPreset.i18n.name) : draft.id ? t('ui.edit') : t('ui.add') }}
      </h2>
      <Button
        v-if="availablePresets.length && !draft.id && !selectedPreset"
        text
        severity="secondary"
        size="small"
        class="preset-trigger"
        @click="popover?.toggle($event)"
        ><Layers :size="16" :stroke-width="1.75" />{{ presetLabel }}</Button
      >
    </div>
    <Message
      v-if="skillPointDraft && skillPointWarning"
      :severity="skillPointWarning === 'sp-negative-first' ? 'warn' : 'secondary'"
      size="small"
    >
      {{ t(`ui.diagnostic.${skillPointWarning}`) }}
    </Message>
    <p v-if="invalid.includes('form')" role="alert" class="validation-summary">
      {{ t('ui.formInvalid') }}
    </p>
    <p v-if="presetError" role="alert" class="validation-summary">{{ presetError }}</p>
    <p v-if="!preview" class="validation-summary" role="status">{{ t('ui.contextUnavailable') }}</p>
    <div v-if="!selectedPreset" class="field">
      <span id="type-label" class="field-label">{{ t('ui.type') }}</span>
      <SelectButton
        v-model="draft.type"
        size="small"
        :options="types"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        :disabled="
          types.length === 1 ||
          (skillPointDraft && !!draft.id) ||
          draft.original?.type === 'spawnParticipant'
        "
        aria-labelledby="type-label"
        class="type-options"
      />
    </div>
    <div v-if="anchor.kind === 'action'" class="field">
      <span id="phase-label" class="field-label">{{ t('ui.phase') }}</span>
      <SelectButton
        v-model="draft.phase"
        size="small"
        :options="phases"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="phase-label"
      />
    </div>
    <template v-if="selectedPreset">
      <TargetGrid
        v-if="selection"
        v-model="draft"
        :participants="selectionTargets"
        :operation-type="selection.type"
        selection-only
        :label="label"
        :image="image"
        :invalid="invalid.includes('target')"
      />
      <div v-for="input in inputs" :key="input.id" class="field">
        <label :id="`preset-label-${input.id}`" :for="`preset-input-${input.id}`">{{
          input.i18n?.label ? t(input.i18n.label) : input.id
        }}</label>
        <Select
          v-if="input.options"
          :input-id="`preset-input-${input.id}`"
          :aria-labelledby="`preset-label-${input.id}`"
          :model-value="numberValue(input.id)"
          :options="input.options.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))"
          option-value="value"
          option-label="label"
          :invalid="invalid.includes(input.id)"
          :aria-describedby="invalid.includes(input.id) ? `preset-error-${input.id}` : undefined"
          fluid
          @update:model-value="values[input.id] = $event"
        />
        <InputNumber
          v-else-if="typeof input.value !== 'string'"
          :model-value="numberValue(input.id)"
          @update:model-value="values[input.id] = $event ?? undefined"
          :input-id="`preset-input-${input.id}`"
          :locale="locale"
          :use-grouping="false"
          :max-fraction-digits="20"
          :suffix="input.i18n?.suffix ? t(input.i18n.suffix) : undefined"
          :placeholder="input.i18n?.placeholder ? t(input.i18n.placeholder) : undefined"
          :invalid="invalid.includes(input.id)"
          :pt="{
            pcInputText: {
              root: {
                'aria-describedby':
                  [
                    input.i18n?.hint ? `preset-hint-${input.id}` : '',
                    invalid.includes(input.id) ? `preset-error-${input.id}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined,
              },
            },
          }"
          fluid
        />
        <InputText
          v-else
          :id="`preset-input-${input.id}`"
          :model-value="stringValue(input.id)"
          @update:model-value="values[input.id] = $event"
          :placeholder="input.i18n?.placeholder ? t(input.i18n.placeholder) : undefined"
          :invalid="invalid.includes(input.id)"
          :aria-describedby="
            [
              input.i18n?.hint ? `preset-hint-${input.id}` : '',
              invalid.includes(input.id) ? `preset-error-${input.id}` : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined
          "
          fluid
        />
        <small v-if="input.i18n?.hint" :id="`preset-hint-${input.id}`" class="fine-print">{{
          t(input.i18n.hint)
        }}</small>
        <small
          v-if="invalid.includes(input.id)"
          :id="`preset-error-${input.id}`"
          class="field-error"
          >{{ inputError(input) }}</small
        >
      </div>
      <p v-for="(summary, index) in summaries" :key="index" class="fine-print">{{ summary }}</p>
    </template>
    <SkillPointFields
      v-else-if="manualDraft"
      v-model:amount="draft.amount"
      :preview="preview?.skillPoints"
      :invalid="invalid.includes('spAmount')"
    />
    <template v-else-if="draft.type === 'characterEffect'">
      <div class="field">
        <span id="character-effect-label" class="field-label">{{
          t('planner.characterEffects.effect')
        }}</span>
        <Select
          aria-labelledby="character-effect-label"
          :model-value="draft.effectId"
          :options="effectOptions"
          option-label="label"
          option-value="value"
          :invalid="invalid.includes('characterEffect')"
          fluid
          @update:model-value="selectEffect"
        />
      </div>
      <div v-if="draft.effectId" class="field">
        <span id="character-effect-source-label" class="field-label">{{
          t('planner.characterEffects.source')
        }}</span>
        <Select
          aria-labelledby="character-effect-source-label"
          v-model="draft.sourceParticipantId"
          :options="sourceOptions"
          option-label="label"
          option-value="value"
          option-disabled="disabled"
          :invalid="invalid.includes('characterEffect')"
          fluid
        />
      </div>
      <div v-if="draft.effectId === 'imbibitorLunae.enhancedBasic'" class="field">
        <span id="effect-cost-label" class="field-label">{{
          t('planner.characterEffects.enhancement')
        }}</span>
        <Select
          v-model="draft.effectCost"
          aria-labelledby="effect-cost-label"
          :options="enhancements"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <p v-if="invalid.includes('characterEffect')" role="alert" class="validation-summary">
        {{ t('ui.diagnostic.character-effect-source') }}
      </p>
    </template>
    <ParticipantFields
      v-else-if="draft.type === 'spawnParticipant'"
      v-model="draft"
      :invalid="invalid"
    />
    <template v-else
      ><TargetGrid
        v-model="draft"
        :participants="participants"
        :label="label"
        :image="image"
        :invalid="invalid.includes('target')" /><EffectFields
        v-model="draft"
        :invalid="invalid"
        :event-target="eventTarget"
    /></template>
    <div v-if="!selectedPreset" class="field">
      <label for="custom-name">{{ t('ui.customName') }}</label
      ><InputText id="custom-name" v-model="draft.customName" :placeholder="automaticName" fluid />
    </div>
    <footer class="editor-footer">
      <div class="editor-actions">
        <Button text severity="secondary" :label="t('ui.cancel')" @click="emit('cancel')" /><Button
          type="submit"
          :label="t('ui.applyOperation')"
          :disabled="submitDisabled"
        />
      </div>
    </footer>
    <Popover
      v-if="availablePresets.length"
      ref="popover"
      :pt="{ root: { 'aria-label': presetLabel } }"
      ><div class="preset-list">
        <template v-for="preset in availablePresets" :key="preset.id">
          <button
            type="button"
            class="preset-option"
            :class="{ 'preset-batch': preset.interaction === 'batch' }"
            :disabled="!!presetIssues[preset.id]"
            :title="issueMessage(preset, presetIssues[preset.id])"
            :aria-describedby="
              presetIssues[preset.id] ? `preset-unavailable-${preset.id}` : undefined
            "
            @click="choose(preset)"
          >
            <GameIcon
              :asset-key="presetIcon(preset)"
              :name="t(preset.i18n.name)"
              :fallback="t('planner.imageMissing')"
            />
            <span class="preset-copy"
              ><span>{{ t(preset.i18n.name) }}</span
              ><small>{{ t(preset.i18n.description) }}</small></span
            >
          </button>
          <small
            v-if="presetIssues[preset.id]"
            :id="`preset-unavailable-${preset.id}`"
            class="fine-print"
            role="status"
            >{{ issueMessage(preset, presetIssues[preset.id]) }}</small
          >
        </template>
      </div></Popover
    >
  </form>
</template>
