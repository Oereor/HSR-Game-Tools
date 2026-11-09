<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Gauge,
  Timer,
  Zap,
  UserRoundPlus,
  Flag,
  LogOut,
  LogIn,
} from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import SpeedModifierTags from './SpeedModifierTags.vue'
import { actionSpeedModifierTags, type CountdownSources } from '../model/speed-modifier-tags'
import OperationCardControls from './OperationCardControls.vue'
import OperationEditor from './OperationEditor.vue'
import OperationTargets from './OperationTargets.vue'
import SkillPointsEditor from './SkillPointsEditor.vue'
import { anchorKey, effectiveSpeed } from '../engine/queue'
import { phaseOperations } from '../engine/effect-config'
import { isTargetedOperation } from '../engine/targeting'
import type {
  ParticipantInfo,
  EffectOperation,
  EventAnchor,
  SimulationState,
  EffectPhase,
  SkillPointWarning,
  SkillPointsState,
} from '../engine/types'
import { formatAV, formatNumber, renderMessage } from '../model/presentation'
import type { ToolLocale } from '../../../locales/types'
import type { OperationDraft } from '../model/editor'
import type { PresetRequest } from '../presets/types'
import { operationMetadata, type MetadataField } from '../model/metadata'
const props = defineProps<{
  countdownSources: CountdownSources
  ahaId: string
  anchor: EventAnchor
  inactive?: boolean
  operations: EffectOperation[]
  context?: SimulationState
  trackSkillPoints: boolean
  entrySkillPoints?: SkillPointsState
  settledSkillPoints?: SkillPointsState
  skillPointWarning?: SkillPointWarning
  preview?: SimulationState
  targets: ParticipantInfo[]
  invalid: string[]
  presetIssues: Record<string, string | undefined>
  label: (id: string) => string
  image: (id: string) => string | undefined
  anchorLabel: (a: EventAnchor) => string
  title: (o: EffectOperation, s?: SimulationState) => string
  operationContext: (o: EffectOperation) => SimulationState | undefined
}>()
const draft = defineModel<OperationDraft>('draft')
const emit = defineEmits<{
  edit: [operation?: EffectOperation]
  remove: [id: string]
  move: [id: string, delta: -1 | 1]
  cancel: []
  submit: []
  preset: [request: PresetRequest]
  addSkillPoints: [phase: EffectPhase]
}>()
const { t, locale } = useI18n()
const regularOperations = computed(() =>
  props.operations.filter((op) => op.type !== 'changeSkillPoints'),
)
const skillPointDraft = computed({
  get: () => (draft.value?.type === 'changeSkillPoints' ? draft.value : undefined),
  set: (value) => {
    draft.value = value
  },
})
const groups = computed(() =>
  props.anchor.kind === 'action'
    ? ['preAction', 'postAction'].map((phase) => ({
        phase,
        operations: phaseOperations(regularOperations.value, phase as 'preAction' | 'postAction'),
      }))
    : [{ phase: '', operations: regularOperations.value }],
)
const currentSpeed = computed(() => {
  const anchor = props.anchor
  const participant =
    anchor.kind === 'start' || anchor.kind === 'cycleBoundary'
      ? undefined
      : props.context?.participants.find((p) => p.id === anchor.participantId)
  return participant && props.context ? effectiveSpeed(participant, props.context) : undefined
})
const speedTags = computed(() =>
  actionSpeedModifierTags(props.anchor, props.context, props.countdownSources),
)
const currentIsAha = computed(() => {
  const anchor = props.anchor
  return (
    (anchor.kind === 'action' || anchor.kind === 'trigger') && anchor.participantId === props.ahaId
  )
})
const overview = ref<HTMLElement>()
watch(
  () => !!draft.value,
  async (editing, was) => {
    if (!editing && was) {
      await nextTick()
      overview.value?.focus()
    }
  },
)
const icon = (o: EffectOperation) =>
  o.type === 'advance'
    ? ArrowUp
    : o.type === 'delay'
      ? ArrowDown
      : o.type === 'immediatelyAct'
        ? Zap
        : o.type === 'addSpeedModifier'
          ? Gauge
          : o.type === 'depart'
            ? LogOut
            : o.type === 'returnToField'
              ? LogIn
              : o.type === 'spawnParticipant'
                ? o.participant.kind === 'actor'
                  ? UserRoundPlus
                  : Timer
                : Plus
const metadata = computed(
  () =>
    new Map(
      regularOperations.value.map((operation) => {
        const state = props.operationContext(operation)
        return [
          operation.id,
          {
            ...operationMetadata(operation, props.label, state),
            participants: state?.participants ?? [],
          },
        ] as const
      }),
    ),
)
const metadataOf = (o: EffectOperation) => metadata.value.get(o.id)!
const fieldIcon = (field: MetadataField, operation: EffectOperation) =>
  field.kind === 'effect'
    ? icon(operation)
    : field.kind === 'speed'
      ? Gauge
      : field.kind === 'duration' || field.kind === 'countdown'
        ? Timer
        : undefined
</script>
<template>
  <section class="inspector" :aria-label="t('ui.inspector')">
    <div class="pane-heading">
      <h2>{{ t('ui.inspector') }}</h2>
    </div>
    <OperationEditor
      v-if="draft && !skillPointDraft"
      v-model="draft"
      :anchor="anchor"
      :participants="targets"
      :preview="preview"
      :invalid="invalid"
      :preset-issues="presetIssues"
      :label="label"
      :image="image"
      @cancel="emit('cancel')"
      @submit="emit('submit')"
      @preset="emit('preset', $event)"
    />
    <div v-else class="inspector-overview">
      <div class="current-node">
        <span v-if="anchor.kind === 'cycleBoundary'" class="event-avatar"
          ><Flag :size="22" :stroke-width="1.75"
        /></span>
        <UnitPortrait
          v-if="anchor.kind === 'action' || anchor.kind === 'trigger'"
          :src="image(anchor.participantId)"
          :name="label(anchor.participantId)"
          :event="anchor.kind === 'trigger'"
          :aha="currentIsAha"
        />
        <div class="current-identity">
          <h2 ref="overview" tabindex="-1">{{ anchorLabel(anchor) }}</h2>
          <span v-if="currentSpeed !== undefined" class="fine-print current-speed"
            >{{ t('ui.currentSpeed') }}
            {{
              t('planner.metadata.speed', {
                speed: formatNumber(currentSpeed, locale as ToolLocale),
              })
            }}</span
          >
          <SpeedModifierTags :tags="speedTags" focusable class="inspector-speed-tags" />
        </div>
        <div v-if="context" class="current-av">
          <strong>{{
            t('common.av', { value: formatAV(context.elapsedAV, locale as ToolLocale) })
          }}</strong>
        </div>
      </div>
      <p v-if="!context" class="validation-summary">
        {{ t(inactive ? 'planner.cycle.disabled' : 'ui.contextUnavailable') }}
      </p>
      <SkillPointsEditor
        v-if="trackSkillPoints"
        :key="anchorKey(anchor)"
        v-model:draft="skillPointDraft"
        :anchor="anchor"
        :operations="operations"
        :editable="!!context"
        :entry-skill-points="entrySkillPoints"
        :settled-skill-points="settledSkillPoints"
        :preview="preview?.skillPoints"
        :warning="skillPointWarning"
        :invalid="invalid"
        :title="title"
        :operation-context="operationContext"
        @add="emit('addSkillPoints', $event)"
        @edit="emit('edit', $event)"
        @move="(id, delta) => emit('move', id, delta)"
        @remove="emit('remove', $event)"
        @cancel="emit('cancel')"
        @submit="emit('submit')"
      />
      <div class="operations-heading">
        <h3>
          {{ t('ui.operations') }}
          <span class="operation-count">{{
            formatNumber(regularOperations.length, locale as ToolLocale)
          }}</span>
        </h3>
        <Button size="small" :disabled="!context || !!skillPointDraft" @click="emit('edit')"
          ><Plus :size="16" :stroke-width="1.75" />{{ t('ui.add') }}</Button
        >
      </div>
      <div v-if="!regularOperations.length" class="empty-operations">
        <p>{{ t('ui.emptyOperations') }}</p>
      </div>
      <div v-for="group in groups" :key="group.phase" class="operation-group">
        <h3 v-if="group.phase && group.operations.length" class="phase-heading">
          {{ t(`ui.${group.phase}`) }}
        </h3>
        <div class="operation-list">
          <article
            v-for="(op, index) in group.operations"
            :key="op.id"
            class="operation-card"
            :data-operation="op.id"
          >
            <div class="operation-top">
              <component
                :is="icon(op)"
                :size="18"
                :stroke-width="1.75"
                :class="
                  op.type === 'advance'
                    ? 'advance-color'
                    : op.type === 'delay'
                      ? 'delay-color'
                      : 'muted'
                "
              /><button class="operation-title" :disabled="!context" @click="emit('edit', op)">
                {{ title(op, operationContext(op)) }}
              </button>
              <OperationCardControls
                :name="title(op, operationContext(op))"
                :first="index === 0"
                :last="index === group.operations.length - 1"
                :edit-disabled="!context"
                @move="emit('move', op.id, $event)"
                @edit="emit('edit', op)"
                @remove="emit('remove', op.id)"
              />
            </div>
            <OperationTargets
              v-if="isTargetedOperation(op)"
              :ids="metadataOf(op).targetIds"
              :fallback="renderMessage(metadataOf(op).target!, locale as ToolLocale, t)"
              :participants="metadataOf(op).participants"
              :label="label"
              :image="image"
            />
            <div class="operation-metadata">
              <span
                v-for="(field, fieldIndex) in metadataOf(op).fields"
                :key="fieldIndex"
                class="metadata-parameter"
                :class="`metadata-${field.kind}`"
              >
                <component
                  v-if="fieldIcon(field, op)"
                  :is="fieldIcon(field, op)"
                  :size="15"
                  :stroke-width="1.75"
                  aria-hidden="true"
                />
                <span>{{ renderMessage(field.message, locale as ToolLocale, t) }}</span>
              </span>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
