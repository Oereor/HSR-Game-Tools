<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Network, Play, Square } from '@lucide/vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import CurrencyResults from './components/CurrencyResults.vue'
import { loadPageData } from './ui/data'
import { createCurrencyWarsSession, type FormField } from './ui/session'
import { createBrowserWorker } from './browser/worker-factory'

const { t } = useI18n()
const data = (() => {
  try {
    return loadPageData()
  } catch {
    return undefined
  }
})()
const state = data
  ? reactive(createCurrencyWarsSession(data.snapshot, data.tasks, createBrowserWorker))
  : undefined
onUnmounted(() => state?.dispose())
const activeGroup = ref('camp')
const slotOptions = [11, 12, 13].map((value) => ({ label: String(value), value }))
const groups = computed(() =>
  (['camp', 'class', 'unique'] as const)
    .map((type) => ({
      type,
      tasks:
        data?.tasks.filter(
          (task) => data.snapshot.traits.find((trait) => trait.id === task.traitId)!.type === type,
        ) ?? [],
    }))
    .filter((group) => group.tasks.length),
)
const traitName = (id: number) => data!.snapshot.traits.find((trait) => trait.id === id)!.name
const invalid = (field: FormField) => !!state?.attempted && state.errors.includes(field)
const attemptWithoutSolution = computed(
  () => state?.lastAttempt && !['optimal', 'feasible'].includes(state.lastAttempt.result.status),
)
const announcement = computed(() =>
  !state
    ? t('currencyWars.error.data')
    : state.busy
      ? t('currencyWars.running')
      : state.cancelled
        ? t('currencyWars.cancelled')
        : state.failure
          ? t(`currencyWars.error.${state.failure}`)
          : state.lastAttempt
            ? t(`currencyWars.status.${state.lastAttempt.result.status}`)
            : '',
)
</script>

<template>
  <div class="currency-page">
    <header class="currency-page-heading">
      <Network :size="24" aria-hidden="true" />
      <h1>{{ t('currencyWars.title') }}</h1>
    </header>
    <p class="currency-intro">{{ t('currencyWars.description') }}</p>
    <Message v-if="!data || !state" severity="error" :closable="false">{{
      t('currencyWars.error.data')
    }}</Message>
    <div v-else class="currency-workspace">
      <section class="currency-controls" aria-labelledby="currency-config-heading">
        <h2 id="currency-config-heading">{{ t('currencyWars.form.title') }}</h2>
        <form @submit.prevent="state.start()">
          <div class="currency-field">
            <span id="currency-slots-label">{{ t('currencyWars.form.slots') }}</span>
            <SelectButton
              v-model="state.form.slots"
              :options="slotOptions"
              option-label="label"
              option-value="value"
              :allow-empty="false"
              aria-labelledby="currency-slots-label"
              :invalid="invalid('slots')"
            />
            <p v-if="invalid('slots')" class="currency-error">
              {{ t('currencyWars.validation.slots') }}
            </p>
          </div>
          <div class="currency-field">
            <label for="currency-budget">{{ t('currencyWars.form.budget') }}</label>
            <InputNumber
              v-model="state.form.emblemBudget"
              input-id="currency-budget"
              :min="12"
              :max-fraction-digits="0"
              :use-grouping="false"
              :invalid="invalid('emblemBudget')"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby': invalid('emblemBudget')
                      ? 'currency-budget-help currency-budget-error'
                      : 'currency-budget-help',
                  },
                },
              }"
            />
            <p id="currency-budget-help" class="currency-help">
              {{ t('currencyWars.form.budgetHint') }}
            </p>
            <p v-if="invalid('emblemBudget')" id="currency-budget-error" class="currency-error">
              {{ t('currencyWars.validation.emblemBudget') }}
            </p>
          </div>
          <div class="currency-field">
            <div class="currency-check">
              <Checkbox
                v-model="state.form.includeExperts"
                input-id="currency-experts"
                binary
                :pt="{ input: { 'aria-describedby': 'currency-experts-help' } }"
              /><label for="currency-experts">{{ t('currencyWars.form.experts') }}</label>
            </div>
            <p id="currency-experts-help" class="currency-help">
              {{ t('currencyWars.form.expertsHint') }}
            </p>
          </div>
          <div class="currency-field">
            <label for="currency-time">{{ t('currencyWars.form.time') }}</label>
            <InputNumber
              v-model="state.form.timeLimitSeconds"
              input-id="currency-time"
              :min="1"
              :max-fraction-digits="0"
              :use-grouping="false"
              :invalid="invalid('timeLimitSeconds')"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby': invalid('timeLimitSeconds')
                      ? 'currency-time-error'
                      : undefined,
                  },
                },
              }"
            />
            <p v-if="invalid('timeLimitSeconds')" id="currency-time-error" class="currency-error">
              {{ t('currencyWars.validation.timeLimitSeconds') }}
            </p>
          </div>
          <div class="currency-task-heading">
            <h3>{{ t('currencyWars.form.tasks') }}</h3>
            <span>{{
              t('currencyWars.form.selection', {
                selected: state.form.taskIds.length,
                total: data.tasks.length,
              })
            }}</span>
          </div>
          <div class="currency-selection-actions">
            <Button
              type="button"
              size="small"
              severity="secondary"
              text
              :label="t('currencyWars.form.selectAll')"
              @click="state.selectAll"
            /><Button
              type="button"
              size="small"
              severity="secondary"
              text
              :label="t('currencyWars.form.clear')"
              @click="state.clearSelection"
            />
          </div>
          <Tabs v-if="groups.length" v-model:value="activeGroup">
            <TabList
              ><Tab v-for="group in groups" :key="group.type" :value="group.type">{{
                t(`currencyWars.type.${group.type}`)
              }}</Tab></TabList
            >
            <TabPanels
              ><TabPanel v-for="group in groups" :key="group.type" :value="group.type">
                <div
                  class="currency-task-options"
                  :aria-label="t(`currencyWars.type.${group.type}`)"
                  :aria-describedby="invalid('taskIds') ? 'currency-task-error' : undefined"
                >
                  <div
                    v-for="task in group.tasks"
                    :key="task.id"
                    class="currency-check currency-task-option"
                  >
                    <Checkbox
                      v-model="state.form.taskIds"
                      :value="task.id"
                      :input-id="`currency-task-${task.id}`"
                      :pt="{
                        input: {
                          'aria-describedby': invalid('taskIds')
                            ? 'currency-task-error'
                            : undefined,
                        },
                      }"
                    />
                    <label :for="`currency-task-${task.id}`">{{
                      t('currencyWars.form.task', {
                        name: traitName(task.traitId),
                        count: task.requiredCount,
                      })
                    }}</label>
                  </div>
                </div>
              </TabPanel></TabPanels
            >
          </Tabs>
          <p v-if="!state.form.taskIds.length" id="currency-task-error" class="currency-error">
            {{ t('currencyWars.validation.taskIds') }}
          </p>
          <div class="currency-run-actions">
            <Button
              type="submit"
              :label="t('currencyWars.start')"
              :disabled="state.busy"
              :aria-describedby="
                state.attempted && state.errors.length ? 'currency-input-error' : undefined
              "
              ><template #icon><Play :size="16" aria-hidden="true" /></template
            ></Button>
            <Button
              v-if="state.busy"
              type="button"
              :label="t('currencyWars.cancel')"
              severity="secondary"
              outlined
              @click="state.cancel"
              ><template #icon><Square :size="15" aria-hidden="true" /></template
            ></Button>
          </div>
          <p
            v-if="state.attempted && state.errors.length"
            id="currency-input-error"
            class="currency-error"
          >
            {{ t('currencyWars.error.input') }}
          </p>
        </form>
        <details class="currency-rules">
          <summary>{{ t('currencyWars.rulesTitle') }}</summary>
          <p>{{ t('currencyWars.rules') }}</p>
        </details>
      </section>
      <section class="currency-output" aria-labelledby="currency-output-heading">
        <h2 id="currency-output-heading" class="sr-only">{{ t('currencyWars.result.title') }}</h2>
        <p class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</p>
        <div v-if="state.busy" class="currency-running" role="status">
          <ProgressSpinner
            style="width: 24px; height: 24px"
            stroke-width="4"
            :aria-label="t('currencyWars.running')"
          /><span>{{ t('currencyWars.running') }}</span>
        </div>
        <Message v-else-if="state.cancelled" severity="info" :closable="false">{{
          t('currencyWars.cancelled')
        }}</Message>
        <Message v-else-if="state.failure" severity="error" :closable="false">{{
          t(`currencyWars.error.${state.failure}`)
        }}</Message>
        <Message
          v-else-if="attemptWithoutSolution && state.lastAttempt"
          :severity="state.lastAttempt.result.status === 'error' ? 'error' : 'warn'"
          :closable="false"
        >
          {{ t(`currencyWars.status.${state.lastAttempt.result.status}`) }}
          <details v-if="state.lastAttempt.result.message">
            <summary>{{ t('currencyWars.error.details') }}</summary>
            <p>{{ state.lastAttempt.result.message }}</p>
          </details>
        </Message>
        <CurrencyResults
          v-if="state.lastValid"
          :snapshot="data.snapshot"
          :catalog="data.visuals"
          :attempt="state.lastValid"
          :stale="state.stale"
          :historical="state.historical"
        />
        <p
          v-else-if="!state.busy && !state.failure && !state.cancelled && !state.lastAttempt"
          class="currency-empty"
        >
          {{ t('currencyWars.result.initial') }}
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.currency-page {
  padding: 20px 0 32px;
}
.currency-page-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
h1 {
  margin: 0;
  font-size: clamp(21px, 3vw, 28px);
}
.currency-intro {
  color: var(--color-muted);
  margin: 12px 0 24px;
  line-height: 1.6;
}
.currency-workspace {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  align-items: start;
  gap: 28px;
}
.currency-controls {
  padding: 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-line);
  border-radius: 8px;
  min-width: 0;
}
h2 {
  margin: 0 0 20px;
  font-size: 18px;
}
.currency-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 13px;
}
.currency-check {
  display: flex;
  align-items: center;
  gap: 10px;
}
.currency-check label {
  cursor: pointer;
  line-height: 1.5;
}
.currency-help,
.currency-rules {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-muted);
  margin: 0;
}
.currency-error {
  font-size: 12px;
  color: var(--color-delay);
  line-height: 1.5;
  margin: 0;
}
.currency-task-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--color-muted);
}
h3 {
  margin: 0;
  font-size: 14px;
  color: var(--color-ink);
}
.currency-selection-actions {
  display: flex;
  gap: 4px;
  margin: 4px 0;
}
.currency-task-options {
  max-height: 320px;
  overflow-y: auto;
  display: grid;
  gap: 12px;
  padding: 12px 4px;
  scrollbar-gutter: stable;
}
.currency-task-option {
  font-size: 13px;
}
.currency-run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 20px 0 10px;
}
.currency-rules {
  margin-top: 16px;
}
.currency-rules summary {
  cursor: pointer;
}
.currency-output {
  min-width: 0;
  display: grid;
  gap: 16px;
}
.currency-running {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  color: var(--color-muted);
  font-size: 13px;
}
.currency-empty {
  color: var(--color-muted);
  text-align: center;
  padding: 64px 20px;
  line-height: 1.8;
}
@media (max-width: 1039px) {
  .currency-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 480px) {
  .currency-controls {
    padding: 16px;
  }
}
</style>
