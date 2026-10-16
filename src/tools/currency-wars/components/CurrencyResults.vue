<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Minus, CircleCheck, Sparkles } from '@lucide/vue'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import CurrencyRoleCard from './CurrencyRoleCard.vue'
import CurrencyImage from './CurrencyImage.vue'
import CurrencyTrait from './CurrencyTrait.vue'
import { resultSummary } from '../ui/result-summary'
import { createVisuals, type VisualCatalog, type VisualMember } from '../ui/visuals'
import type { SolvedAttempt } from '../ui/session'
import type { Snapshot } from '../types'
const props = defineProps<{
  snapshot: Snapshot
  catalog: VisualCatalog
  attempt: SolvedAttempt
  stale: boolean
  historical: boolean
}>()
const { t, n } = useI18n()
const visuals = computed(() =>
  createVisuals(props.snapshot, props.catalog, import.meta.env.BASE_URL),
)
const result = computed(() => props.attempt.result)
const summary = computed(() => resultSummary(props.attempt))
const evaluation = computed(() => result.value.evaluation!)
const lineup = computed(() => result.value.lineup!)
const members = computed(() =>
  lineup.value.members.map((member) =>
    visuals.value.member(
      member,
      evaluation.value.members.find((m) => m.formId === member.formId)!,
    ),
  ),
)
const activeTraits = computed(() =>
  evaluation.value.traits.filter((trait) => trait.activeThreshold !== null),
)
const specialMembers = computed(() => members.value.filter((member) => member.role.mechanic))
const selectedMember = shallowRef<VisualMember>()
const roleDetailsOpen = ref(false)
function inspect(member: VisualMember) {
  selectedMember.value = member
  roleDetailsOpen.value = true
}
function mechanicDescription(member: VisualMember) {
  if (member.role.mechanic === 'navigator')
    return member.target
      ? t('currencyWars.visual.navigatorLink', {
          name: member.role.name,
          target: member.target.name,
        })
      : t('currencyWars.visual.navigatorWithoutTarget', { name: member.role.name })
  return member.bronyaTrait
    ? t('currencyWars.visual.bronyaAssignment', {
        name: member.role.name,
        trait: member.bronyaTrait.name,
      })
    : t('currencyWars.visual.bronyaUnassigned', { name: member.role.name })
}
watch(
  () => props.attempt,
  () => {
    roleDetailsOpen.value = false
  },
)
</script>

<template>
  <div class="currency-results">
    <Message v-if="stale" severity="warn" :closable="false">{{
      t('currencyWars.result.stale')
    }}</Message>
    <Message v-else-if="historical" severity="info" :closable="false">{{
      t('currencyWars.result.historical')
    }}</Message>
    <section aria-labelledby="currency-lineup-heading">
      <div class="currency-lineup-heading">
        <h2 id="currency-lineup-heading">{{ t('currencyWars.result.lineup') }}</h2>
      </div>
      <ul class="currency-roster">
        <CurrencyRoleCard
          v-for="member in members"
          :key="member.role.id"
          :member="member"
          @inspect="inspect"
        />
      </ul>
      <p v-if="!members.length" class="currency-muted">{{ t('currencyWars.result.noRoles') }}</p>
    </section>
    <div class="currency-summary" :aria-label="t('currencyWars.result.title')">
      <Tag severity="secondary" class="currency-summary-tag">
        <CircleCheck :size="18" class="currency-complete-icon" aria-hidden="true" />
        <span>{{
          t('currencyWars.result.completedSummary', {
            completed: summary.completed,
            total: summary.tasks,
          })
        }}</span>
      </Tag>
      <Tag severity="secondary" class="currency-summary-tag">
        <Sparkles :size="18" class="currency-emblems-icon" aria-hidden="true" />
        <span>{{
          t('currencyWars.result.emblemsSummary', { used: summary.emblems, budget: summary.budget })
        }}</span>
      </Tag>
    </div>
    <Message v-if="result.status === 'feasible'" severity="warn" :closable="false">
      {{ t('currencyWars.status.feasible') }}
    </Message>
    <Message
      v-for="warning in evaluation.warnings"
      :key="warning"
      severity="warn"
      :closable="false"
    >
      {{
        t(
          warning === 'bronya-tie-conservative-lower-bound'
            ? 'currencyWars.result.bronyaWarning'
            : 'currencyWars.result.genericWarning',
        )
      }}
    </Message>
    <section aria-labelledby="currency-tasks-heading">
      <h2 id="currency-tasks-heading">{{ t('currencyWars.result.tasks') }}</h2>
      <ul class="currency-task-results">
        <li v-for="task in evaluation.tasks" :key="task.id">
          <CurrencyTrait
            class="currency-task-name"
            :source="visuals.traitUrl(task.traitId)"
            :name="visuals.trait(task.traitId).name"
          />
          <span class="currency-task-description">{{
            t('currencyWars.result.taskGoal', { count: task.requiredCount })
          }}</span>
          <span
            class="currency-task-count"
            :aria-label="
              t('currencyWars.result.taskCounts', {
                actual: task.actualCount,
                required: task.requiredCount,
              })
            "
          >
            {{ task.actualCount }} / {{ task.requiredCount }}
          </span>
          <span class="currency-task-status" :class="{ completed: task.completed }">
            <Check v-if="task.completed" :size="15" aria-hidden="true" />
            <Minus v-else :size="15" aria-hidden="true" />
            {{
              t(task.completed ? 'currencyWars.result.completed' : 'currencyWars.result.incomplete')
            }}
          </span>
        </li>
      </ul>
    </section>
    <details v-if="specialMembers.length" class="currency-disclosure">
      <summary>{{ t('currencyWars.result.mechanics') }}</summary>
      <ul v-if="specialMembers.length" class="currency-mechanics currency-muted">
        <li v-for="member in specialMembers" :key="member.role.id">
          {{ mechanicDescription(member) }}
        </li>
      </ul>
    </details>
    <details class="currency-disclosure">
      <summary>
        {{ t('currencyWars.result.allActiveTraits', { count: activeTraits.length }) }}
      </summary>
      <ul class="currency-trait-list">
        <li v-for="trait in activeTraits" :key="trait.traitId">
          <details>
            <summary>
              <CurrencyTrait
                :source="visuals.traitUrl(trait.traitId)"
                :name="visuals.trait(trait.traitId).name"
              />
              <span>{{
                t('currencyWars.result.traitCounts', {
                  count: trait.count,
                  threshold: trait.activeThreshold,
                })
              }}</span>
            </summary>
            <p class="currency-muted">
              {{
                t('currencyWars.result.contributors', {
                  names: trait.contributors.map((id) => visuals.role(id)?.name ?? id).join(' · '),
                })
              }}
            </p>
          </details>
        </li>
      </ul>
      <p v-if="!activeTraits.length" class="currency-muted">
        {{ t('currencyWars.result.noTraits') }}
      </p>
    </details>
    <details class="currency-disclosure currency-solve-details">
      <summary>{{ t('currencyWars.result.details') }}</summary>
      <p>{{ t(`currencyWars.status.${result.status}`) }}</p>
      <p>
        {{
          t('currencyWars.result.conditions', {
            slots: attempt.request.slots,
            budget: attempt.request.emblemBudget,
            experts: t(
              attempt.request.includeExperts
                ? 'currencyWars.form.expertsAllowed'
                : 'currencyWars.form.expertsExcluded',
            ),
            time: attempt.request.timeLimitSeconds,
            tasks: attempt.request.tasks.length,
          })
        }}
      </p>
      <p>
        {{
          t('currencyWars.result.selectedTasks', {
            names: attempt.request.tasks
              .map((task) =>
                t('currencyWars.form.task', {
                  name: visuals.trait(task.traitId).name,
                  count: task.requiredCount,
                }),
              )
              .join(' · '),
          })
        }}
      </p>
      <p>
        {{
          t('currencyWars.result.elapsed', {
            seconds: n(result.elapsedSeconds, { maximumFractionDigits: 3 }),
          })
        }}
      </p>
      <p v-if="result.solverStatus">
        {{ t('currencyWars.result.solverStatus', { status: result.solverStatus }) }}
      </p>
      <p v-if="Number.isFinite(result.objectiveBound)">
        {{ t('currencyWars.result.objectiveBound', { value: result.objectiveBound }) }}
      </p>
      <p v-if="Number.isFinite(result.gap)">
        {{ t('currencyWars.result.gap', { value: result.gap }) }}
      </p>
      <p v-if="result.message">{{ result.message }}</p>
    </details>
    <Dialog
      v-model:visible="roleDetailsOpen"
      modal
      :draggable="false"
      :header="selectedMember?.role.name"
      :close-button-props="{ 'aria-label': t('currencyWars.visual.closeDetails') }"
      :style="{ width: '440px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 32px)' }"
      @after-hide="selectedMember = undefined"
    >
      <div v-if="selectedMember" class="currency-role-details">
        <p v-if="selectedMember.role.expert">{{ t('currencyWars.visual.expert') }}</p>
        <p v-if="selectedMember.role.position">
          {{ t(`currencyWars.visual.${selectedMember.role.position}`) }}
        </p>
        <p>
          {{
            t('currencyWars.visual.innate', {
              names:
                selectedMember.innate.map((trait) => trait.name).join(' · ') ||
                t('currencyWars.none'),
            })
          }}
        </p>
        <h3>{{ t('currencyWars.visual.wornEmblems') }}</h3>
        <ul class="currency-detail-emblems">
          <li v-for="(emblem, index) in selectedMember.slots" :key="index">
            <template v-if="emblem">
              <span class="currency-detail-emblem-image"
                ><CurrencyImage :source="emblem.url" :name="emblem.name" kind="emblem"
              /></span>
              <span>{{
                t('currencyWars.visual.emblemTrait', { name: emblem.name, trait: emblem.traitName })
              }}</span>
            </template>
            <span v-else class="currency-muted">{{ t('currencyWars.visual.emptySlot') }}</span>
          </li>
        </ul>
        <p>
          {{
            t('currencyWars.visual.extra', {
              names:
                selectedMember.extra.map((trait) => trait.name).join(' · ') ||
                t('currencyWars.none'),
            })
          }}
        </p>
        <p v-if="selectedMember.role.mechanic">{{ mechanicDescription(selectedMember) }}</p>
        <p class="currency-muted">
          {{ t('currencyWars.visual.formId', { id: selectedMember.role.id }) }}
        </p>
      </div>
      <template #footer>
        <Button
          type="button"
          severity="secondary"
          text
          :label="t('currencyWars.visual.closeDetails')"
          @click="roleDetailsOpen = false"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.currency-results {
  display: grid;
  gap: 24px;
  min-width: 0;
}
.currency-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.currency-summary-tag {
  gap: 10px;
  padding: 8px 14px;
  border: 1px solid var(--color-line);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.currency-complete-icon {
  color: var(--color-ally);
}
.currency-emblems-icon {
  color: var(--color-accent);
}
.currency-lineup-heading {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}
.currency-lineup-heading h2 {
  margin: 0;
}
.currency-lineup-heading::after {
  content: '';
  height: 1px;
  flex: 1;
  background: var(--color-line);
}
h2 {
  font-size: 20px;
  margin: 0 0 14px;
}
.currency-muted,
.currency-solve-details {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.currency-roster {
  display: grid;
  --role-size: 128px;
  grid-template-columns: repeat(auto-fill, minmax(0, var(--role-size)));
  justify-content: start;
  gap: 16px 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.currency-trait-list,
.currency-task-results,
.currency-mechanics,
.currency-detail-emblems {
  padding: 0;
  list-style: none;
  margin: 0;
}
.currency-mechanics {
  display: grid;
  gap: 4px;
  margin-top: 12px;
}
.currency-trait-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
  margin-top: 12px;
  font-size: 13px;
}
summary {
  cursor: pointer;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.currency-disclosure > summary {
  color: var(--color-muted);
  font-size: 13px;
}
.currency-task-results li {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(0, 1.4fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--color-line);
  font-size: 13px;
}
.currency-task-results {
  border: 1px solid var(--color-line);
  border-radius: 6px;
  overflow: hidden;
}
.currency-task-results li:last-child {
  border-bottom: 0;
}
.currency-task-name {
  font-weight: 600;
}
.currency-task-description {
  color: var(--color-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.currency-trait-list summary {
  --trait-icon-size: 28px;
}
.currency-trait-list summary > span:last-child {
  margin-left: 8px;
  color: var(--color-muted);
  font-size: 12px;
}
.currency-task-count {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.currency-task-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-muted);
  font-size: 12px;
}
.currency-task-status.completed {
  color: var(--color-ally);
}
.currency-role-details {
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.currency-role-details h3 {
  font-size: 13px;
  margin: 16px 0 8px;
}
.currency-detail-emblems {
  display: grid;
  gap: 8px;
}
.currency-detail-emblems li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.currency-detail-emblem-image {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}
@media (max-width: 1199px) {
  .currency-task-results li {
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 4px 8px;
    padding: 8px;
  }
  .currency-task-description {
    grid-column: 1 / -1;
    grid-row: 2;
    padding-left: 48px;
  }
}
@media (max-width: 480px) {
  .currency-roster {
    --role-size: 104px;
    gap: 16px 10px;
  }
  .currency-summary {
    gap: 8px;
  }
  .currency-summary-tag {
    padding: 6px 10px;
  }
  .currency-task-status {
    font-size: 11px;
  }
}
</style>
