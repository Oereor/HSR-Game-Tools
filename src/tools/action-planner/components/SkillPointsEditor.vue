<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { Diamond, Pencil, Plus } from '@lucide/vue'
import OperationCardControls from './OperationCardControls.vue'
import type { ToolLocale } from '../../../locales/types'
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
  entrySkillPoints?: SkillPointsState
  settledSkillPoints?: SkillPointsState
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
const skillPointOperations = computed(() =>
  props.operations.filter((op): op is Change => op.type === 'changeSkillPoints'),
)
const groups = computed(() =>
  props.anchor.kind === 'action'
    ? phases.map((phase) => ({
        phase,
        operations: skillPointOperations.value.filter((op) => op.phase === phase),
      }))
    : [{ phase: undefined, operations: skillPointOperations.value }],
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
const nodeBalance = computed(() => {
  const entry = props.entrySkillPoints
  if (!entry) return undefined
  const settled = props.settledSkillPoints
  return {
    before: format(entry.current),
    after: settled ? format(settled.current) : undefined,
    max: format(entry.max),
  }
})
function outcome(before: SkillPointsState | undefined, amount: number | undefined) {
  if (!before || amount === undefined) return t('planner.sp.unavailable')
  return t('planner.sp.outcome', {
    before: format(before.current),
    after: format(skillPointBalance(before, amount)),
  })
}
</script>

<template>
  <section :aria-label="t('planner.sp.operations')">
    <div class="operations-heading">
      <h3>
        {{ t('planner.sp.operations') }}
        <span class="operation-count">{{ format(skillPointOperations.length) }}</span>
      </h3>
      <Button
        size="small"
        :disabled="!editable || !!draft"
        :aria-label="t('planner.sp.add')"
        @click="emit('add', 'postAction')"
        ><Plus :size="16" :stroke-width="1.75" />{{ t('ui.add') }}</Button
      >
    </div>
    <p v-if="nodeBalance" class="sp-balance">
      <span class="sr-only">
        {{
          t('planner.sp.nodeBalance', {
            before: nodeBalance.before,
            after: nodeBalance.after ?? t('planner.sp.settlementUnavailable'),
            max: nodeBalance.max,
          })
        }}
      </span>
      <strong aria-hidden="true">{{ nodeBalance.before }} → {{ nodeBalance.after ?? '—' }}</strong>
      <span class="sp-cap" aria-hidden="true"> / {{ nodeBalance.max }}</span>
    </p>
    <p v-else class="sp-balance muted">{{ t('planner.sp.unavailable') }}</p>
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
      <div class="sp-form-actions">
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
      <div v-for="group in groups" :key="group.phase ?? 'event'" class="operation-group">
        <h3 v-if="group.phase" class="phase-heading">{{ t(`ui.${group.phase}`) }}</h3>
        <div class="operation-list">
          <article v-if="!group.operations.length" class="operation-card sp-operation">
            <div class="operation-top">
              <Diamond :size="18" :stroke-width="1.75" class="sp-neutral" aria-hidden="true" />
              <span class="sp-change sp-neutral">{{ t('planner.sp.noChange') }}</span>
              <div class="card-controls">
                <Button
                  v-tooltip="t('ui.edit')"
                  size="small"
                  text
                  severity="secondary"
                  :disabled="!editable"
                  :aria-label="t('planner.sp.editDefault')"
                  @click="emit('add', group.phase ?? 'postAction')"
                  ><Pencil :size="15"
                /></Button>
              </div>
            </div>
          </article>
          <article
            v-for="(op, index) in group.operations"
            :key="op.id"
            class="operation-card sp-operation"
            :data-operation="op.id"
          >
            <div class="operation-top">
              <Diamond
                :size="18"
                :stroke-width="1.75"
                :class="tone(op.amount)"
                aria-hidden="true"
              />
              <div class="sp-change">
                <button
                  type="button"
                  class="operation-title"
                  :title="title(op)"
                  @click="emit('edit', op)"
                >
                  <span :class="tone(op.amount)">{{
                    op.amount === 0 ? t('planner.sp.noChange') : format(op.amount, true)
                  }}</span>
                </button>
                <span class="fine-print">{{
                  outcome(operationContext(op)?.skillPoints, op.amount)
                }}</span>
              </div>
              <OperationCardControls
                :name="title(op)"
                :first="index === 0"
                :last="index === group.operations.length - 1"
                @move="emit('move', op.id, $event)"
                @edit="emit('edit', op)"
                @remove="emit('remove', op.id)"
              />
            </div>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.sp-balance {
  margin: 0 0 8px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.sp-cap {
  color: var(--color-muted);
  font-size: 0.875em;
}
.sp-operation .operation-top {
  align-items: center;
}
.sp-operation .card-controls {
  margin-top: 0;
}
.sp-change,
.sp-form-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.sp-change {
  font-size: 13px;
}
.sp-change .operation-title {
  flex: initial;
  max-width: 100%;
}
.sp-form-actions {
  justify-content: space-between;
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
</style>
