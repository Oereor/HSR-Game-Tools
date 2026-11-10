<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { Diamond, Pencil, Plus, Sparkles, Zap } from '@lucide/vue'
import OperationCardControls from './OperationCardControls.vue'
import UnitPortrait from './UnitPortrait.vue'
import type { ToolLocale } from '../../../locales/types'
import type {
  CharacterEffectOutcome,
  CharacterEffectState,
  DiagnosticCode,
  EffectOperation,
  EffectPhase,
  EventAnchor,
  SimulationState,
  SkillPointWarning,
  SkillPointsState,
  SkillPointOperation,
  SparkleRefill,
} from '../engine/types'
import { formatNumber, formatSkillPointOutcome } from '../model/presentation'
import { isSkillPointOperation } from '../engine/effect-config'
import { ARCHER_CHARGE_CAP, SPARKLE_STORAGE_CAP, SQUAMA_CAP } from '../engine/character-effects'

const props = defineProps<{
  anchor: EventAnchor
  operations: EffectOperation[]
  editable: boolean
  entrySkillPoints?: SkillPointsState
  settledSkillPoints?: SkillPointsState
  entryCharacterEffects?: ReadonlyMap<string, CharacterEffectState>
  settledCharacterEffects?: ReadonlyMap<string, CharacterEffectState>
  sparkleRefills?: readonly SparkleRefill[]
  effectOutcomes: ReadonlyMap<string, CharacterEffectOutcome>
  operationWarnings: ReadonlyMap<string, DiagnosticCode>
  warning?: SkillPointWarning
  title: (operation: EffectOperation) => string
  label: (id: string) => string
  image: (id: string) => string | undefined
  operationContext: (operation: EffectOperation) => SimulationState | undefined
}>()
const emit = defineEmits<{
  add: [phase: EffectPhase]
  edit: [operation: SkillPointOperation]
  move: [id: string, delta: -1 | 1]
  remove: [id: string]
  duplicate: [id: string]
}>()
const { t, locale } = useI18n()
const phases = ['preAction', 'postAction'] as const
const skillPointOperations = computed(() => props.operations.filter(isSkillPointOperation))
const groups = computed(() =>
  props.anchor.kind === 'action'
    ? phases.map((phase) => ({
        phase,
        operations: skillPointOperations.value.filter((op) => op.phase === phase),
      }))
    : [{ phase: undefined, operations: skillPointOperations.value }],
)
const tone = (amount: number | bigint) =>
  amount > 0 ? 'advance-color' : amount < 0 ? 'delay-color' : 'sp-neutral'
const format = (value: number | bigint, signed = false) =>
  formatNumber(value, locale.value as ToolLocale, signed)
const formatBalance = (
  before: number | bigint,
  after: number | bigint | undefined,
  max: number,
) => ({
  before: format(before),
  after: after === undefined ? undefined : format(after),
  max: format(max),
})
function resourceValue(effect: CharacterEffectState) {
  switch (effect.kind) {
    case 'archer':
      return { kind: 'charge', value: effect.charge, cap: ARCHER_CHARGE_CAP }
    case 'imbibitorLunae':
      return { kind: 'squama', value: effect.squama, cap: SQUAMA_CAP }
    case 'sparkle':
      return { kind: 'storedSP', value: effect.storedSP, cap: SPARKLE_STORAGE_CAP }
  }
}
const resources = computed(() => {
  const characterResources = [...(props.entryCharacterEffects ?? [])].flatMap(([id, effect]) => {
    const entry = resourceValue(effect)
    const settled = props.settledCharacterEffects?.get(id)
    const after = settled?.kind === effect.kind ? resourceValue(settled).value : undefined
    if (entry.value === 0 && after === 0) return []
    return [
      {
        id,
        name: t(`planner.characterEffects.resource.${entry.kind}`),
        balance: formatBalance(entry.value, after, entry.cap),
      },
    ]
  })
  const entry = props.entrySkillPoints
  return [
    {
      id: undefined,
      name: undefined,
      balance: entry
        ? formatBalance(entry.current, props.settledSkillPoints?.current, entry.max)
        : undefined,
    },
    ...characterResources,
  ]
})
interface CardDetails {
  tone: ReturnType<typeof tone>
  delta?: string
  summary?: string
  warning?: DiagnosticCode
}
const details = computed(
  () =>
    new Map<string, CardDetails>(
      skillPointOperations.value.map((op) => {
        if (op.type === 'changeSkillPoints')
          return [
            op.id,
            {
              tone: tone(op.amount),
              delta: t('planner.sp.delta', { amount: format(op.amount, true) }),
              summary: formatSkillPointOutcome(
                props.operationContext(op)?.skillPoints,
                op.amount,
                locale.value as ToolLocale,
                t,
              ),
            },
          ] as const
        const result = props.effectOutcomes.get(op.id)
        if (!result)
          return [
            op.id,
            {
              tone: 'sp-neutral',
              warning: props.operationWarnings.get(op.id),
            },
          ] as const
        const sp = result.skillPoints.after - result.skillPoints.before
        const charge = result.charge ? result.charge.after - result.charge.before : 0
        const resource = result.resource
        const payment = result.payment
        const changes = []
        if (result.charge)
          changes.push(t('planner.characterEffects.chargeDelta', { amount: format(charge, true) }))
        if (resource)
          changes.push(
            t('planner.characterEffects.resourceChange', {
              resource: t(`planner.characterEffects.resource.${resource.kind}`),
              before: format(resource.before),
              after: format(resource.after),
            }),
          )
        if (payment || op.effectId === 'archer.followUp' || op.effectId === 'sparkle.ultimate')
          changes.push(t('planner.sp.delta', { amount: format(sp, true) }))
        const summary =
          payment && resource
            ? t('planner.characterEffects.payment', {
                nominal: format(payment.nominalCost),
                substitute: format(payment.substituteUsed),
                resource: t(`planner.characterEffects.resource.${resource.kind}`),
                actual: format(payment.actualSpCost),
              })
            : result.wastedSkillPoints
              ? t('planner.characterEffects.sparkleWaste', {
                  amount: format(result.wastedSkillPoints),
                })
              : undefined
        return [
          op.id,
          {
            tone: tone(sp || charge || (resource ? resource.after - resource.before : 0)),
            delta: changes.join(' · '),
            summary,
          },
        ] as const
      }),
    ),
)
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
    <div class="resource-balances">
      <span
        v-for="{ id, name, balance } in resources"
        :key="id === undefined ? 'sp' : `character:${id}`"
        class="resource-balance"
      >
        <UnitPortrait v-if="id !== undefined" :src="image(id)" :name="label(id)" compact />
        <Diamond v-else :size="18" :stroke-width="1.75" class="sp-neutral" aria-hidden="true" />
        <template v-if="balance">
          <span class="sr-only">
            {{
              t('planner.sp.nodeBalance', {
                resource: name ?? t('planner.sp.setup'),
                before: balance.before,
                after: balance.after ?? t('planner.sp.settlementUnavailable'),
                max: balance.max,
              })
            }}
          </span>
          <span v-if="name" aria-hidden="true">{{ name }}</span>
          <span class="resource-value" aria-hidden="true">
            <strong>{{ balance.before }} → {{ balance.after ?? '—' }}</strong>
            <span class="sp-cap"> / {{ balance.max }}</span>
          </span>
        </template>
        <span v-else class="muted">{{ t('planner.sp.unavailable') }}</span>
      </span>
    </div>
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
            <component
              :is="op.type === 'characterEffect' ? Zap : Diamond"
              :size="18"
              :stroke-width="1.75"
              :class="details.get(op.id)?.tone"
              aria-hidden="true"
            />
            <div class="sp-change">
              <button
                type="button"
                class="operation-title"
                :title="title(op)"
                @click="emit('edit', op)"
              >
                {{ title(op) }}
              </button>
              <span v-if="details.get(op.id)?.delta" :class="details.get(op.id)?.tone">
                {{ details.get(op.id)?.delta }}
              </span>
              <span v-if="details.get(op.id)?.summary" class="fine-print">
                {{ details.get(op.id)?.summary }}
              </span>
            </div>
            <OperationCardControls
              :name="title(op)"
              :first="index === 0"
              :last="index === group.operations.length - 1"
              :copyable="op.type === 'characterEffect'"
              @move="emit('move', op.id, $event)"
              @edit="emit('edit', op)"
              @duplicate="emit('duplicate', op.id)"
              @remove="emit('remove', op.id)"
            />
          </div>
          <Message v-if="details.get(op.id)?.warning" size="small" severity="warn">
            {{ t(`ui.diagnostic.${details.get(op.id)?.warning}`) }}
          </Message>
        </article>
      </div>
    </div>
    <div v-if="sparkleRefills?.length" class="operation-group">
      <h3 class="phase-heading">{{ t('planner.characterEffects.turnEnd') }}</h3>
      <div class="operation-list">
        <article
          v-for="refill in sparkleRefills"
          :key="refill.sourceParticipantId"
          class="operation-card sp-operation"
        >
          <div class="operation-top">
            <Sparkles :size="18" :stroke-width="1.75" class="advance-color" aria-hidden="true" />
            <div class="sp-change">
              <span class="operation-title">
                {{
                  t('planner.characterEffects.sparkleRefill', {
                    name: label(refill.sourceParticipantId),
                  })
                }}
              </span>
              <span class="advance-color">
                {{
                  t('planner.sp.delta', {
                    amount: format(refill.skillPoints.after - refill.skillPoints.before, true),
                  })
                }}
              </span>
              <span class="fine-print">
                {{
                  t('planner.characterEffects.resourceChange', {
                    resource: t('planner.characterEffects.resource.storedSP'),
                    before: format(refill.storedSP.before),
                    after: format(refill.storedSP.after),
                  })
                }}
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.resource-balances {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0 0 8px;
  overflow-x: auto;
}
.resource-balance {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: 13px;
}
.resource-value {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.sp-cap {
  color: var(--color-muted);
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
