<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Minus, CircleCheck, Sparkles } from '@lucide/vue'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import CurrencyRoleCard from './CurrencyRoleCard.vue'
import CurrencyImage from './CurrencyImage.vue'
import CurrencyTrait from './CurrencyTrait.vue'
import { resultSummary } from '../ui/result-summary'
import {
  createVisuals,
  sortVisualMembers,
  type VisualCatalog,
  type VisualMember,
} from '../ui/visuals'
import type { SolvedAttempt } from '../ui/session'
import type { CandidateSolution, Snapshot } from '../types'
const props = defineProps<{
  snapshot: Snapshot
  catalog: VisualCatalog
  attempt: SolvedAttempt
  solution: CandidateSolution
  selectedIndex: number
  stale: boolean
  historical: boolean
}>()
const emit = defineEmits<{ select: [index: number] }>()
const { t, n } = useI18n()
const visuals = computed(() =>
  createVisuals(props.snapshot, props.catalog, import.meta.env.BASE_URL),
)
const batch = computed(() => props.attempt.result)
const result = computed(() => props.solution)
const solutionOptions = computed(() =>
  batch.value.solutions.map((_, index) => ({
    value: index,
    label: t('currencyWars.result.solution', { index: index + 1 }),
  })),
)
const summary = computed(() => resultSummary(props.attempt, result.value))
const evaluation = computed(() => result.value.evaluation!)
const lineup = computed(() => result.value.lineup!)
const members = computed(() =>
  sortVisualMembers(
    lineup.value.members.map((member) =>
      visuals.value.member(
        member,
        evaluation.value.members.find((m) => m.formId === member.formId)!,
      ),
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
  () => props.solution,
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
        <SelectButton
          v-if="solutionOptions.length > 1"
          :model-value="selectedIndex"
          :options="solutionOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          size="small"
          :aria-label="t('currencyWars.result.chooseSolution')"
          @update:model-value="emit('select', $event)"
        />
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
    <Message v-if="!result.originalOptimal" severity="warn" :closable="false">
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
            <ul
              class="currency-contributors currency-muted"
              :aria-label="
                t('currencyWars.result.contributors', {
                  names: trait.contributors.map((id) => visuals.role(id)?.name ?? id).join(' · '),
                })
              "
            >
              <li v-for="id in trait.contributors" :key="id">
                <span class="currency-contributor-image"
                  ><CurrencyImage
                    :source="visuals.portrait(id)"
                    :name="visuals.role(id)?.name ?? id"
                    kind="role"
                /></span>
                <span>{{ visuals.role(id)?.name ?? id }}</span>
              </li>
            </ul>
          </details>
        </li>
      </ul>
      <p v-if="!activeTraits.length" class="currency-muted">
        {{ t('currencyWars.result.noTraits') }}
      </p>
    </details>
    <details class="currency-disclosure currency-solve-details">
      <summary>{{ t('currencyWars.result.details') }}</summary>
      <p>
        {{
          t(
            result.originalOptimal
              ? 'currencyWars.result.originalOptimal'
              : 'currencyWars.result.candidateOnly',
          )
        }}
      </p>
      <p>
        {{
          t('currencyWars.result.proof', {
            count: t(
              batch.maximumCompletedProven
                ? 'currencyWars.result.proven'
                : 'currencyWars.result.unproven',
            ),
            emblems: t(
              batch.minimumEmblemsProven
                ? 'currencyWars.result.proven'
                : 'currencyWars.result.unproven',
            ),
          })
        }}
      </p>
      <p>
        {{
          t('currencyWars.result.batchEnd', {
            reason: t(`currencyWars.termination.${batch.termination}`),
          })
        }}
      </p>
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
            seconds: n(batch.totalElapsedSeconds, { maximumFractionDigits: 3 }),
          })
        }}
      </p>
      <p>
        {{
          t('currencyWars.result.candidateElapsed', {
            seconds: n(result.elapsedSeconds, { maximumFractionDigits: 3 }),
            found: n(result.foundAtSeconds, { maximumFractionDigits: 3 }),
          })
        }}
      </p>
      <p v-if="result.solverStatus">
        {{ t('currencyWars.result.subproblemStatus', { status: result.solverStatus }) }}
      </p>
      <p v-if="Number.isFinite(result.objectiveBound)">
        {{ t('currencyWars.result.objectiveBound', { value: result.objectiveBound }) }}
      </p>
      <p v-if="Number.isFinite(result.gap)">
        {{ t('currencyWars.result.gap', { value: result.gap }) }}
      </p>
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
        <h3>{{ t('currencyWars.visual.innateTitle') }}</h3>
        <div class="currency-detail-traits">
          <CurrencyTrait
            v-for="trait in selectedMember.innate"
            :key="trait.id"
            :source="visuals.traitUrl(trait.id)"
            :name="trait.name"
          />
          <span v-if="!selectedMember.innate.length">{{ t('currencyWars.none') }}</span>
        </div>
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
        <h3>{{ t('currencyWars.visual.extraTitle') }}</h3>
        <div class="currency-detail-traits">
          <CurrencyTrait
            v-for="trait in selectedMember.extra"
            :key="trait.id"
            :source="visuals.traitUrl(trait.id)"
            :name="trait.name"
          />
          <span v-if="!selectedMember.extra.length">{{ t('currencyWars.none') }}</span>
        </div>
        <div v-if="selectedMember.target" class="currency-navigator-target">
          <span class="currency-detail-emblem-image"
            ><CurrencyImage
              :source="visuals.portrait(selectedMember.target.id)"
              :name="selectedMember.target.name"
              kind="role"
          /></span>
          <span>{{
            t('currencyWars.visual.navigatorTarget', { name: selectedMember.target.name })
          }}</span>
        </div>
        <p
          v-if="selectedMember.target && ['8007', '8009'].includes(selectedMember.target.id)"
          class="currency-muted"
        >
          {{ t('currencyWars.visual.trailblazerInheritance') }}
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
  flex-wrap: wrap;
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
.currency-detail-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  --trait-icon-size: 24px;
}
.currency-contributors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 8px 0 0;
  margin: 0;
  list-style: none;
}
.currency-contributors li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.currency-contributor-image {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.currency-navigator-target {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
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
