<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Gauge,
  Timer,
  Zap,
  UserRoundPlus,
} from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import OperationEditor from './OperationEditor.vue'
import OperationTargets from './OperationTargets.vue'
import { effectiveSpeed } from '../../../engine/action-planner/queue'
import { phaseOperations } from '../../../engine/action-planner/effect-config'
import type {
  EffectOperation,
  EventAnchor,
  SimulationState,
} from '../../../engine/action-planner/types'
import { formatAV, formatNumber, renderMessage } from '../model/presentation'
import type { ToolLocale } from '../../../locales/types'
import type { OperationDraft } from '../model/editor'
import { operationMetadata, type MetadataField } from '../model/metadata'
const props = defineProps<{
  anchor: EventAnchor
  operations: EffectOperation[]
  context?: SimulationState
  preview?: SimulationState
  targets: { id: string; kind: 'actor' | 'scheduledEvent'; name: string; camp?: 'ally' | 'enemy' }[]
  invalid: string[]
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
}>()
const { t, locale } = useI18n()
const groups = computed(() =>
  props.anchor.kind === 'action'
    ? ['preAction', 'postAction'].map((phase) => ({
        phase,
        operations: phaseOperations(props.operations, phase as 'preAction' | 'postAction'),
      }))
    : [{ phase: '', operations: props.operations }],
)
const currentSpeed = computed(() => {
  const anchor = props.anchor
  const participant =
    anchor.kind === 'start'
      ? undefined
      : props.context?.participants.find((p) => p.id === anchor.participantId)
  return participant ? effectiveSpeed(participant) : undefined
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
          : o.participant.kind === 'actor'
            ? UserRoundPlus
            : Timer
const metadata = computed(
  () =>
    new Map(
      props.operations.map((operation) => {
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
      v-if="draft"
      v-model="draft"
      :anchor="anchor"
      :participants="targets"
      :preview="preview"
      :invalid="invalid"
      :label="label"
      :image="image"
      @cancel="emit('cancel')"
      @submit="emit('submit')"
    />
    <div v-else class="inspector-overview">
      <div class="current-node">
        <UnitPortrait
          v-if="anchor.kind !== 'start'"
          :src="image(anchor.participantId)"
          :name="label(anchor.participantId)"
          :event="anchor.kind === 'trigger'"
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
        </div>
        <div v-if="context" class="current-av">
          <strong>{{
            t('common.av', { value: formatAV(context.elapsedAV, locale as ToolLocale) })
          }}</strong>
        </div>
      </div>
      <p v-if="!context" class="validation-summary">{{ t('ui.contextUnavailable') }}</p>
      <div class="operations-heading">
        <h3>
          {{ t('ui.operations') }}
          <span class="operation-count">{{
            formatNumber(operations.length, locale as ToolLocale)
          }}</span>
        </h3>
        <Button size="small" :disabled="!context" @click="emit('edit')"
          ><Plus :size="16" :stroke-width="1.75" />{{ t('ui.add') }}</Button
        >
      </div>
      <div v-if="!operations.length" class="empty-operations">
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
              <div class="card-controls">
                <Button
                  v-tooltip="t('ui.moveUp')"
                  text
                  size="small"
                  severity="secondary"
                  :disabled="index === 0"
                  :aria-label="t('ui.moveUp')"
                  @click="emit('move', op.id, -1)"
                  ><ArrowUp :size="15" /></Button
                ><Button
                  v-tooltip="t('ui.moveDown')"
                  text
                  size="small"
                  severity="secondary"
                  :disabled="index === group.operations.length - 1"
                  :aria-label="t('ui.moveDown')"
                  @click="emit('move', op.id, 1)"
                  ><ArrowDown :size="15" /></Button
                ><Button
                  v-tooltip="t('ui.edit')"
                  text
                  size="small"
                  severity="secondary"
                  :disabled="!context"
                  :aria-label="
                    t('planner.accessibility.edit', { name: title(op, operationContext(op)) })
                  "
                  @click="emit('edit', op)"
                  ><Pencil :size="15" /></Button
                ><Button
                  v-tooltip="t('ui.remove')"
                  text
                  size="small"
                  severity="secondary"
                  :aria-label="
                    t('planner.accessibility.remove', { name: title(op, operationContext(op)) })
                  "
                  @click="emit('remove', op.id)"
                  ><Trash2 :size="15"
                /></Button>
              </div>
            </div>
            <OperationTargets
              v-if="op.type !== 'spawnParticipant'"
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
