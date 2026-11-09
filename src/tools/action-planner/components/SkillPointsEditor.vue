<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { ArrowDown, ArrowUp, Diamond, Pencil, Plus, Trash2 } from '@lucide/vue'
import type { ToolLocale } from '../../../locales/types'
import { phaseOperations } from '../engine/effect-config'
import { skillPointBalance } from '../engine/skill-points'
import type {
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationState,
  SkillPointWarning,
  SkillPointsState,
} from '../engine/types'
import type { OperationDraft } from '../model/editor'
import { formatNumber } from '../model/presentation'

type Change = Extract<EffectOperation, { type: 'changeSkillPoints' }>
const props = defineProps<{
  anchor: EventAnchor
  operations: EffectOperation[]
  editable: boolean
  preview?: SkillPointsState
  warning?: SkillPointWarning
  invalid: string[]
  title: (operation: EffectOperation) => string
  operationContext: (operation: EffectOperation) => SimulationState | undefined
}>()
const draft = defineModel<OperationDraft>('draft')
const emit = defineEmits<{
  add: [phase: EffectPhase]
  edit: [operation: Change]
  move: [id: string, delta: -1 | 1]
  remove: [id: string]
  cancel: []
  submit: []
}>()
const { t, locale } = useI18n()
const phases = ['preAction', 'postAction'] as const
const changes = (ops: EffectOperation[]) =>
  ops.filter((op): op is Change => op.type === 'changeSkillPoints')
const groups = computed(() =>
  props.anchor.kind === 'action'
    ? phases.map((phase) => ({
        phase,
        operations: changes(phaseOperations(props.operations, phase)),
      }))
    : [{ phase: undefined, operations: changes(props.operations) }],
)
const presets = {
  basic: 1,
  skill: -1,
  imbibitorLunae: -3,
  sparkle: 6,
  rin: 4,
  none: 0,
} as const
const presetOptions = computed(() =>
  Object.entries(presets).map(([key, amount]) => ({
    amount,
    label: t('planner.sp.presetOption', {
      name: t(`planner.sp.presets.${key}`),
      amount: format(amount, true),
    }),
  })),
)
const phaseOptions = computed(() => phases.map((value) => ({ value, label: t(`ui.${value}`) })))
const amountText = ref('')
const amountInput = ref<HTMLElement>()
watch(
  draft,
  async (next) => {
    amountText.value = next?.amount?.toString() ?? ''
    if (next) {
      await nextTick()
      amountInput.value?.querySelector('input')?.focus()
    }
  },
  { immediate: true },
)
function setAmount(text: string) {
  amountText.value = text
  const value = /^[+-]?\d+$/.test(text.trim()) ? Number(text) : NaN
  if (draft.value) draft.value.amount = Number.isSafeInteger(value) ? value : undefined
}
const amountInvalid = computed(
  () => !!draft.value && (draft.value.amount === undefined || props.invalid.includes('spAmount')),
)
const tone = (amount: number) =>
  amount > 0 ? 'advance-color' : amount < 0 ? 'delay-color' : 'sp-neutral'
const format = (value: number | bigint, signed = false) =>
  formatNumber(value, locale.value as ToolLocale, signed)
function outcome(before: SkillPointsState | undefined, amount: number | undefined) {
  if (!before || amount === undefined) return t('planner.sp.unavailable')
  return t('planner.sp.outcome', {
    before: format(before.current),
    after: format(skillPointBalance(before, amount)),
  })
}
</script>

<template>
  <section class="sp-editor" :aria-label="t('planner.sp.setup')">
    <Message
      v-if="warning"
      :severity="warning === 'sp-negative-first' ? 'warn' : 'secondary'"
      size="small"
    >
      {{ t(`ui.diagnostic.${warning}`) }}
    </Message>
    <form v-if="draft" class="sp-form" @submit.prevent="emit('submit')">
      <div class="sp-fields">
        <div v-if="anchor.kind === 'action'" class="field">
          <label for="sp-phase">{{ t('ui.phase') }}</label>
          <Select
            v-model="draft.phase"
            input-id="sp-phase"
            :options="phaseOptions"
            option-label="label"
            option-value="value"
            size="small"
            fluid
          />
        </div>
        <div class="field">
          <label for="sp-preset">{{ t('ui.presets') }}</label>
          <Select
            input-id="sp-preset"
            :model-value="draft.amount"
            :options="presetOptions"
            option-label="label"
            option-value="amount"
            :placeholder="t('planner.sp.custom')"
            size="small"
            fluid
            @update:model-value="setAmount(String($event))"
          />
        </div>
        <div ref="amountInput" class="field">
          <label for="sp-amount">{{ t('planner.sp.amount') }}</label>
          <InputText
            id="sp-amount"
            :model-value="amountText"
            :invalid="amountInvalid"
            :aria-describedby="amountInvalid ? 'sp-amount-error' : undefined"
            size="small"
            fluid
            @update:model-value="setAmount($event ?? '')"
          />
        </div>
      </div>
      <small v-if="amountInvalid" id="sp-amount-error" class="field-error">{{
        t('planner.sp.invalidAmount')
      }}</small>
      <p class="fine-print">{{ t('planner.sp.presetHint') }}</p>
      <div class="sp-row">
        <span class="fine-print" aria-live="polite">{{ outcome(preview, draft.amount) }}</span>
        <div class="card-controls">
          <Button
            size="small"
            text
            severity="secondary"
            :label="t('ui.cancel')"
            @click="emit('cancel')"
          />
          <Button
            type="submit"
            size="small"
            :label="t('ui.applyOperation')"
            :disabled="amountInvalid"
          />
        </div>
      </div>
    </form>
    <template v-else>
      <div v-for="group in groups" :key="group.phase ?? 'event'" class="sp-group">
        <div class="sp-row">
          <h3>{{ group.phase ? t(`ui.${group.phase}`) : t('planner.sp.setup') }}</h3>
          <span v-if="!group.operations.length" class="sp-value sp-neutral">
            <Diamond :size="14" aria-hidden="true" />{{ t('planner.sp.noChange') }}
          </span>
          <Button
            v-tooltip="t('planner.sp.add')"
            size="small"
            text
            severity="secondary"
            :disabled="!editable"
            :aria-label="t('planner.sp.add')"
            @click="emit('add', group.phase ?? 'postAction')"
            ><Plus :size="15"
          /></Button>
        </div>
        <div v-for="(op, index) in group.operations" :key="op.id" class="sp-row sp-operation">
          <div class="sp-description">
            <span class="sp-value" :class="tone(op.amount)">
              <Diamond :size="14" aria-hidden="true" />{{ format(op.amount, true) }}
            </span>
            <span class="fine-print" :title="title(op)">{{
              outcome(operationContext(op)?.skillPoints, op.amount)
            }}</span>
          </div>
          <div class="card-controls">
            <Button
              v-tooltip="t('ui.moveUp')"
              size="small"
              text
              severity="secondary"
              :disabled="index === 0"
              :aria-label="t('ui.moveUp')"
              @click="emit('move', op.id, -1)"
              ><ArrowUp :size="15"
            /></Button>
            <Button
              v-tooltip="t('ui.moveDown')"
              size="small"
              text
              severity="secondary"
              :disabled="index === group.operations.length - 1"
              :aria-label="t('ui.moveDown')"
              @click="emit('move', op.id, 1)"
              ><ArrowDown :size="15"
            /></Button>
            <Button
              v-tooltip="t('ui.edit')"
              size="small"
              text
              severity="secondary"
              :aria-label="t('planner.accessibility.edit', { name: title(op) })"
              @click="emit('edit', op)"
              ><Pencil :size="15"
            /></Button>
            <Button
              v-tooltip="t('ui.remove')"
              size="small"
              text
              severity="secondary"
              :aria-label="t('planner.accessibility.remove', { name: title(op) })"
              @click="emit('remove', op.id)"
              ><Trash2 :size="15"
            /></Button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.sp-editor {
  display: grid;
  gap: 6px;
  border-block: 1px solid var(--p-content-border-color);
  padding-block: 8px;
  margin-bottom: 16px;
}
.sp-row,
.sp-value,
.sp-description {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sp-row {
  justify-content: space-between;
}
.sp-description {
  flex-wrap: wrap;
  min-width: 0;
  overflow-wrap: anywhere;
}
.sp-operation {
  padding-inline-start: 8px;
}
.sp-row h3 {
  margin: 0;
  font-size: 0.8125rem;
}
.sp-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.sp-neutral {
  color: var(--p-yellow-600);
}
:global(.app-dark) .sp-neutral {
  color: var(--p-yellow-400);
}
.sp-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
  gap: 8px;
}
.sp-form p {
  margin-block: 4px;
}
.sp-editor .card-controls {
  flex-shrink: 0;
}
</style>
