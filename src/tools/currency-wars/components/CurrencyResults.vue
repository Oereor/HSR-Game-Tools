<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import CurrencyRoleCard from './CurrencyRoleCard.vue'
import { createVisuals, type VisualCatalog } from '../ui/visuals'
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
</script>

<template>
  <div class="currency-results">
    <Message v-if="stale" severity="warn" :closable="false">{{
      t('currencyWars.result.stale')
    }}</Message>
    <Message v-else-if="historical" severity="info" :closable="false">{{
      t('currencyWars.result.historical')
    }}</Message>
    <section aria-labelledby="currency-result-heading">
      <div class="currency-result-heading">
        <h2 id="currency-result-heading">{{ t('currencyWars.result.title') }}</h2>
        <Tag
          :value="t(`currencyWars.status.${result.status}`)"
          :severity="result.status === 'optimal' ? 'success' : 'warn'"
        />
      </div>
      <p class="currency-result-summary">
        {{
          t('currencyWars.result.summary', {
            completed: evaluation.completedCount,
            tasks: attempt.request.tasks.length,
            roles: lineup.members.length,
            slots: attempt.request.slots,
            emblems: evaluation.emblemCount,
            budget: attempt.request.emblemBudget,
          })
        }}
      </p>
      <p class="currency-muted">
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
      <details class="currency-condition-tasks">
        <summary>{{ t('currencyWars.result.selectedTasks') }}</summary>
        <p>
          {{
            attempt.request.tasks
              .map((task) => `${visuals.trait(task.traitId).name} ≥ ${task.requiredCount}`)
              .join(' · ')
          }}
        </p>
      </details>
      <p class="currency-muted">
        {{
          t('currencyWars.result.elapsed', {
            seconds: n(result.elapsedSeconds, { maximumFractionDigits: 3 }),
          })
        }}
      </p>
      <Message
        v-for="warning in evaluation.warnings"
        :key="warning"
        severity="warn"
        :closable="false"
        >{{
          t(
            warning === 'bronya-tie-conservative-lower-bound'
              ? 'currencyWars.result.bronyaWarning'
              : 'currencyWars.result.genericWarning',
          )
        }}</Message
      >
    </section>
    <section aria-labelledby="currency-lineup-heading">
      <h2 id="currency-lineup-heading">{{ t('currencyWars.result.lineup') }}</h2>
      <ul class="currency-roster">
        <CurrencyRoleCard v-for="member in members" :key="member.role.id" :member="member" />
      </ul>
      <p v-if="!members.length" class="currency-muted">{{ t('currencyWars.result.noRoles') }}</p>
    </section>
    <section aria-labelledby="currency-traits-heading">
      <h2 id="currency-traits-heading">{{ t('currencyWars.result.activeTraits') }}</h2>
      <ul class="currency-trait-list">
        <li
          v-for="trait in evaluation.traits.filter((trait) => trait.activeThreshold !== null)"
          :key="trait.traitId"
        >
          <details>
            <summary>
              {{
                t('currencyWars.result.trait', {
                  name: visuals.trait(trait.traitId).name,
                  count: trait.count,
                  threshold: trait.activeThreshold,
                })
              }}
            </summary>
            <p>
              {{
                t('currencyWars.result.contributors', {
                  names: trait.contributors.map((id) => visuals.role(id)?.name ?? id).join(' · '),
                })
              }}
            </p>
          </details>
        </li>
      </ul>
      <p
        v-if="!evaluation.traits.some((trait) => trait.activeThreshold !== null)"
        class="currency-muted"
      >
        {{ t('currencyWars.result.noTraits') }}
      </p>
    </section>
    <section aria-labelledby="currency-tasks-heading">
      <h2 id="currency-tasks-heading">{{ t('currencyWars.result.tasks') }}</h2>
      <ul class="currency-task-results">
        <li v-for="task in evaluation.tasks" :key="task.id">
          <div>
            <strong>{{ visuals.trait(task.traitId).name }}</strong
            ><span class="currency-muted">{{
              t('currencyWars.result.taskCounts', {
                required: task.requiredCount,
                actual: task.actualCount,
              })
            }}</span>
          </div>
          <Tag
            :severity="task.completed ? 'success' : 'secondary'"
            :value="
              t(task.completed ? 'currencyWars.result.completed' : 'currencyWars.result.incomplete')
            "
          />
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.currency-results {
  display: grid;
  gap: 24px;
  min-width: 0;
}
.currency-result-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
h2 {
  font-size: 17px;
  margin: 0 0 12px;
}
.currency-result-heading h2 {
  margin: 0;
}
.currency-result-summary {
  font-size: 17px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}
.currency-muted,
.currency-condition-tasks {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
}
.currency-roster {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 20px 12px;
  padding: 0;
  list-style: none;
}
.currency-trait-list,
.currency-task-results {
  padding: 0;
  list-style: none;
  margin: 0;
}
.currency-trait-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
}
.currency-trait-list li {
  font-size: 13px;
}
.currency-trait-list p {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
}
summary {
  cursor: pointer;
  line-height: 1.6;
}
.currency-task-results li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-line);
  font-size: 13px;
}
.currency-task-results li div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}
</style>
