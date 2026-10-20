<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Network } from '@lucide/vue'
import {
  HPanel,
  HTabs,
  HTabPanels,
  HSwitch,
  HSlider,
  HCheckbox,
  HInput,
  HRadio,
  HButton,
  HFadeContainer,
} from 'astral-ui/components'
import 'astral-ui/scoped-theme.css'
import './ui/theme.css'
import CurrencyResults from './components/CurrencyResults.vue'
import CurrencyImage from './components/CurrencyImage.vue'
import { createVisuals } from './ui/visuals'
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
const visuals = data
  ? createVisuals(data.snapshot, data.visuals, import.meta.env.BASE_URL)
  : undefined
const search = ref('')
const visibleTasks = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (
    data?.tasks.filter((task) =>
      [traitName(task.traitId), task.id, task.traitId, task.requiredCount].some((value) =>
        String(value).toLocaleLowerCase().includes(query),
      ),
    ) ?? []
  )
})
const configTab = ref('tasks')
const configTabs = computed(() => [
  { value: 'tasks', label: t('currencyWars.form.tasks') },
  { value: 'settings', label: t('currencyWars.form.settings') },
])
const traitName = (id: number) => data!.snapshot.traits.find((trait) => trait.id === id)!.name
function toggleTask(id: string, enabled: boolean) {
  if (!state || !data) return
  const selected = new Set(state.form.taskIds)
  if (enabled) selected.add(id)
  else selected.delete(id)
  state.form.taskIds = data.tasks.filter((task) => selected.has(task.id)).map((task) => task.id)
}
const invalid = (field: FormField) => !!state?.attempted && state.errors.includes(field)
function start() {
  if (!state?.start() && state?.errors.some((field) => field !== 'taskIds'))
    configTab.value = 'settings'
}
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
    <p v-if="!data || !state" class="currency-notice currency-notice--error" role="alert">
      {{ t('currencyWars.error.data') }}
    </p>
    <div v-else class="currency-workspace">
      <form class="currency-controls" @submit.prevent="start">
        <HPanel class="h-theme currency-theme" :aria-label="t('currencyWars.form.title')">
          <HTabs
            v-model="configTab"
            :items="configTabs"
            :label="t('currencyWars.form.title')"
            id-prefix="currency-config"
            variant="pill"
          />
          <HTabPanels
            :value="configTab"
            :order="['tasks', 'settings']"
            id-prefix="currency-config"
            :animate-height="false"
            :animated="false"
          >
            <template #default="{ value }">
              <div v-if="value === 'tasks'" class="currency-task-config">
                <HInput
                  v-model="search"
                  type="search"
                  id="currency-task-search"
                  :aria-label="t('currencyWars.form.search')"
                  :placeholder="t('currencyWars.form.search')"
                />
                <div class="currency-task-actions">
                  <HButton
                    type="button"
                    @click="state.form.taskIds = data.tasks.map((task) => task.id)"
                    >{{ t('currencyWars.form.selectAll') }}</HButton
                  >
                  <HButton type="button" @click="state.form.taskIds = []">{{
                    t('currencyWars.form.clear')
                  }}</HButton>
                </div>
                <p class="currency-selection-count" aria-live="polite">
                  {{
                    t('currencyWars.form.selection', {
                      selected: state.form.taskIds.length,
                      total: data.tasks.length,
                    })
                  }}
                </p>
                <HFadeContainer
                  class="currency-task-scroll"
                  :fade-edges="['top', 'bottom']"
                  :fade-size="24"
                  :label="t('currencyWars.form.tasks')"
                  :aria-describedby="!state.form.taskIds.length ? 'currency-task-error' : undefined"
                >
                  <ul class="currency-task-switches">
                    <li v-for="task in visibleTasks" :key="task.id">
                      <HSwitch
                        :model-value="state.form.taskIds.includes(task.id)"
                        :label="`${traitName(task.traitId)} ≥${task.requiredCount}`"
                        @update:model-value="toggleTask(task.id, $event)"
                      >
                        <template #icon
                          ><span class="currency-switch-icon" aria-hidden="true"
                            ><CurrencyImage
                              :source="visuals?.traitUrl(task.traitId)"
                              :name="traitName(task.traitId)"
                              kind="trait" /></span
                        ></template>
                      </HSwitch>
                    </li>
                  </ul>
                  <p v-if="!visibleTasks.length" class="currency-empty">
                    {{ t('currencyWars.form.noMatches') }}
                  </p>
                </HFadeContainer>
                <p
                  v-if="!state.form.taskIds.length"
                  id="currency-task-error"
                  class="currency-error"
                >
                  {{ t('currencyWars.validation.taskIds') }}
                </p>
              </div>
              <div v-else class="currency-settings">
                <fieldset class="currency-objective">
                  <legend>{{ t('currencyWars.form.objective') }}</legend>
                  <HRadio
                    v-model="state.form.objective"
                    name="currency-objective"
                    value="min-roles"
                    >{{ t('currencyWars.form.minRoles') }}</HRadio
                  >
                  <HRadio
                    v-model="state.form.objective"
                    name="currency-objective"
                    value="min-emblems"
                    >{{ t('currencyWars.form.minEmblems') }}</HRadio
                  >
                  <p v-if="invalid('objective')" class="currency-error">
                    {{ t('currencyWars.validation.objective') }}
                  </p>
                </fieldset>
                <HSlider
                  v-model="state.form.slots"
                  :label="t('currencyWars.form.slots')"
                  :min="1"
                  :max="13"
                  :step="1"
                  controls
                  input-id="currency-slots"
                  :decrement-label="
                    t('currencyWars.form.decrease', { name: t('currencyWars.form.slots') })
                  "
                  :increment-label="
                    t('currencyWars.form.increase', { name: t('currencyWars.form.slots') })
                  "
                  :input-attrs="{
                    'aria-invalid': invalid('slots'),
                    'aria-describedby': invalid('slots') ? 'currency-slots-error' : undefined,
                  }"
                />
                <p v-if="invalid('slots')" id="currency-slots-error" class="currency-error">
                  {{ t('currencyWars.validation.slots') }}
                </p>
                <HSlider
                  v-model="state.form.emblemBudget"
                  :label="t('currencyWars.form.budget')"
                  :min="12"
                  :max="39"
                  :step="1"
                  controls
                  input-id="currency-budget"
                  :decrement-label="
                    t('currencyWars.form.decrease', { name: t('currencyWars.form.budget') })
                  "
                  :increment-label="
                    t('currencyWars.form.increase', { name: t('currencyWars.form.budget') })
                  "
                  :input-attrs="{
                    'aria-invalid': invalid('emblemBudget'),
                    'aria-describedby': invalid('emblemBudget')
                      ? 'currency-budget-error'
                      : undefined,
                  }"
                />
                <p v-if="invalid('emblemBudget')" id="currency-budget-error" class="currency-error">
                  {{ t('currencyWars.validation.emblemBudget') }}
                </p>
                <HCheckbox v-model="state.form.includeExperts">{{
                  t('currencyWars.form.experts')
                }}</HCheckbox>
              </div>
            </template>
          </HTabPanels>
          <template #footer>
            <div class="currency-run-actions">
              <HButton
                type="submit"
                variant="primary"
                :loading="state.busy"
                :disabled="state.busy || !state.form.taskIds.length"
                :aria-describedby="
                  state.attempted && state.errors.length ? 'currency-input-error' : undefined
                "
                >{{ t('currencyWars.start') }}</HButton
              >
              <HButton v-if="state.busy" @click="state.cancel">{{
                t('currencyWars.cancel')
              }}</HButton>
            </div>
            <p
              v-if="state.attempted && state.errors.length"
              id="currency-input-error"
              class="currency-error"
            >
              {{ t('currencyWars.error.input') }}
            </p>
          </template>
        </HPanel>
      </form>
      <HPanel
        class="h-theme currency-theme currency-output"
        :title="t('currencyWars.result.title')"
      >
        <p class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</p>
        <p v-if="state.busy" class="currency-notice" role="status">
          {{ t('currencyWars.running') }}
        </p>
        <p v-else-if="state.cancelled" class="currency-notice">{{ t('currencyWars.cancelled') }}</p>
        <p v-else-if="state.failure" class="currency-notice currency-notice--error" role="alert">
          {{ t(`currencyWars.error.${state.failure}`) }}
        </p>
        <p
          v-else-if="attemptWithoutSolution && state.lastAttempt"
          class="currency-notice currency-notice--warning"
        >
          {{ t(`currencyWars.status.${state.lastAttempt.result.status}`) }}
        </p>
        <CurrencyResults
          v-if="state.lastValid"
          :snapshot="data.snapshot"
          :catalog="data.visuals"
          :crafts="data.crafts"
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
      </HPanel>
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
.currency-intro {
  color: var(--color-muted);
  margin-bottom: 24px;
}
.currency-workspace {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
}
.currency-controls,
.currency-output {
  min-width: 0;
}
.currency-task-config {
  padding-top: 16px;
}
.currency-task-actions {
  display: flex;
  gap: 8px;
  padding: 10px 0;
}
.currency-objective {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  min-width: 0;
}
.currency-objective legend {
  font-size: 12px;
  margin-bottom: 12px;
}
.currency-selection-count {
  font-size: 12px;
  color: var(--h-muted);
  padding-bottom: 12px;
}
.currency-task-scroll {
  height: clamp(320px, 55dvh, 480px);
}
.currency-task-switches {
  list-style: none;
  padding: 4px;
  margin: 0;
}
.currency-task-switches li {
  padding: 10px 2px;
  border-bottom: 1px solid var(--h-line);
}
.currency-task-switches li:last-child {
  border-bottom: 0;
}
.currency-switch-icon {
  display: block;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
}
.currency-settings {
  display: grid;
  align-content: start;
  gap: 28px;
  padding: 32px 0 20px;
  min-height: 320px;
}
.currency-run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.currency-run-actions > :first-child {
  flex: 1;
}
.currency-empty {
  color: var(--h-muted);
  padding: 56px 12px;
  text-align: center;
  font-size: 13px;
}
@media (min-width: 960px) and (max-width: 1099px) {
  .currency-workspace {
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 16px;
  }
}
@media (max-width: 959px) {
  .currency-workspace {
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
  }
  .currency-task-scroll {
    height: 360px;
  }
  .currency-settings {
    min-height: 300px;
  }
}
</style>
