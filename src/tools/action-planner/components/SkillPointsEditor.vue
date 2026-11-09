<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { Diamond, Pencil, Plus } from '@lucide/vue'
import OperationCardControls from './OperationCardControls.vue'
import type { ToolLocale } from '../../../locales/types'
import type {
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationState,
  SkillPointWarning,
  SkillPointsState,
} from '../engine/types'
import { formatNumber, formatSkillPointOutcome } from '../model/presentation'

type Change = Extract<EffectOperation, { type: 'changeSkillPoints' }>
const props = defineProps<{
  anchor: EventAnchor
  operations: EffectOperation[]
  editable: boolean
  entrySkillPoints?: SkillPointsState
  settledSkillPoints?: SkillPointsState
  warning?: SkillPointWarning
  title: (operation: EffectOperation) => string
  operationContext: (operation: EffectOperation) => SimulationState | undefined
}>()
const emit = defineEmits<{
  add: [phase: EffectPhase]
  edit: [operation: Change]
  move: [id: string, delta: -1 | 1]
  remove: [id: string]
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
        :disabled="!editable"
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
            <Diamond :size="18" :stroke-width="1.75" :class="tone(op.amount)" aria-hidden="true" />
            <div class="sp-change">
              <button
                type="button"
                class="operation-title"
                :title="title(op)"
                @click="emit('edit', op)"
              >
                {{ title(op) }}
              </button>
              <span :class="tone(op.amount)">{{
                t('planner.sp.delta', { amount: format(op.amount, true) })
              }}</span>
              <span class="fine-print">{{
                formatSkillPointOutcome(
                  operationContext(op)?.skillPoints,
                  op.amount,
                  locale as ToolLocale,
                  t,
                )
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
.sp-change {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.sp-change .operation-title {
  flex: initial;
  max-width: 100%;
}
.sp-neutral {
  color: var(--p-yellow-600);
}
:global(.app-dark) .sp-neutral {
  color: var(--p-yellow-400);
}
</style>
