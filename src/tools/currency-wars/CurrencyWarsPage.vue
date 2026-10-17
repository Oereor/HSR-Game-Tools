<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Network, Play, Square, X, Plus, Info } from '@lucide/vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import CurrencyResults from './components/CurrencyResults.vue'
import CurrencyTrait from './components/CurrencyTrait.vue'
import { createVisuals } from './ui/visuals'
import { loadPageData } from './ui/data'
import { createCurrencyWarsSession, type FormField } from './ui/session'
import { createTaskSelection } from './ui/task-selection'
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
const advancedOpen = ref(false)
const selection = reactive(
  createTaskSelection(
    data?.tasks ?? [],
    () => state?.form.taskIds ?? [],
    (ids) => {
      if (state) state.form.taskIds = ids
    },
  ),
)
const selectedTasks = computed(
  () => data?.tasks.filter((task) => state?.form.taskIds.includes(task.id)) ?? [],
)
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
async function removeTask(id: string, event: Event) {
  const row = (event.currentTarget as HTMLElement).closest('li')
  const next =
    row?.nextElementSibling?.querySelector<HTMLButtonElement>('button') ??
    row?.previousElementSibling?.querySelector<HTMLButtonElement>('button') ??
    row?.closest('section')?.querySelector<HTMLButtonElement>('.currency-edit-tasks')
  selection.remove(id)
  await nextTick()
  next?.focus()
}
const invalid = (field: FormField) => !!state?.attempted && state.errors.includes(field)
function start() {
  state?.start()
  if (invalid('timeLimitSeconds')) advancedOpen.value = true
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
    <Message v-if="!data || !state" severity="error" :closable="false">{{
      t('currencyWars.error.data')
    }}</Message>
    <div v-else class="currency-workspace">
      <section class="currency-controls" aria-labelledby="currency-config-heading">
        <h2 id="currency-config-heading" class="sr-only">{{ t('currencyWars.form.title') }}</h2>
        <form @submit.prevent="start">
          <section class="currency-task-config" aria-labelledby="currency-selected-heading">
            <div class="currency-task-heading">
              <h3 id="currency-selected-heading">{{ t('currencyWars.form.tasks') }}</h3>
              <span aria-live="polite">{{
                t('currencyWars.form.selection', {
                  selected: state.form.taskIds.length,
                  total: data.tasks.length,
                })
              }}</span>
            </div>
            <ul
              v-if="selectedTasks.length"
              class="currency-task-summary"
              tabindex="0"
              :aria-label="t('currencyWars.form.tasks')"
            >
              <li v-for="task in selectedTasks" :key="task.id">
                <div class="currency-selected-task">
                  <CurrencyTrait
                    v-tooltip.top="traitName(task.traitId)"
                    class="currency-selected-trait"
                    :source="visuals?.traitUrl(task.traitId)"
                    :name="traitName(task.traitId)"
                    :title="traitName(task.traitId)"
                  />
                  <span
                    class="currency-task-threshold"
                    :aria-label="t('currencyWars.form.required', { count: task.requiredCount })"
                    >{{
                      t('currencyWars.form.requiredCompact', { count: task.requiredCount })
                    }}</span
                  >
                </div>
                <Button
                  type="button"
                  text
                  rounded
                  severity="secondary"
                  class="currency-remove-task"
                  :aria-label="
                    t('currencyWars.form.removeTask', {
                      name: traitName(task.traitId),
                      count: task.requiredCount,
                    })
                  "
                  @click="removeTask(task.id, $event)"
                >
                  <template #icon><X :size="15" aria-hidden="true" /></template>
                </Button>
              </li>
            </ul>
            <p v-else id="currency-task-error" class="currency-error">
              {{ t('currencyWars.validation.taskIds') }}
            </p>
            <Button
              type="button"
              severity="secondary"
              outlined
              class="currency-edit-tasks"
              :label="t('currencyWars.form.editTasks')"
              :aria-describedby="!state.form.taskIds.length ? 'currency-task-error' : undefined"
              @click="selection.open"
            >
              <template #icon><Plus :size="16" aria-hidden="true" /></template>
            </Button>
          </section>
          <section class="currency-limits" aria-labelledby="currency-limits-heading">
            <h3 id="currency-limits-heading">{{ t('currencyWars.form.limits') }}</h3>
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
                :aria-describedby="invalid('slots') ? 'currency-slots-error' : undefined"
              />
              <p v-if="invalid('slots')" id="currency-slots-error" class="currency-error">
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
          </section>
          <details
            class="currency-advanced"
            :open="advancedOpen"
            @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
          >
            <summary>{{ t('currencyWars.form.advanced') }}</summary>
            <div class="currency-check currency-experts">
              <Checkbox
                v-model="state.form.includeExperts"
                input-id="currency-experts"
                binary
                :pt="{ input: { 'aria-describedby': 'currency-experts-help' } }"
              />
              <label for="currency-experts">{{ t('currencyWars.form.experts') }}</label>
              <Button
                type="button"
                text
                rounded
                severity="secondary"
                class="currency-help-button"
                :aria-label="t('currencyWars.form.expertsHint')"
                v-tooltip.focus.top="t('currencyWars.form.expertsHint')"
                :title="t('currencyWars.form.expertsHint')"
              >
                <template #icon><Info :size="15" aria-hidden="true" /></template>
              </Button>
              <span id="currency-experts-help" class="sr-only">{{
                t('currencyWars.form.expertsHint')
              }}</span>
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
                        ? 'currency-time-help currency-time-error'
                        : 'currency-time-help',
                    },
                  },
                }"
              />
              <p id="currency-time-help" class="currency-help">
                {{ t('currencyWars.form.timeHint') }}
              </p>
              <p v-if="invalid('timeLimitSeconds')" id="currency-time-error" class="currency-error">
                {{ t('currencyWars.validation.timeLimitSeconds') }}
              </p>
            </div>
            <p class="currency-help">{{ t('currencyWars.rules') }}</p>
          </details>
          <div class="currency-run-actions">
            <Button
              type="submit"
              :label="t('currencyWars.start')"
              :loading="state.busy"
              :disabled="state.busy || !state.form.taskIds.length"
              :aria-describedby="
                state.attempted && state.errors.length ? 'currency-input-error' : undefined
              "
              ><template #icon><Play v-if="!state.busy" :size="16" aria-hidden="true" /></template
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
      </section>
      <Dialog
        v-model:visible="selection.visible"
        modal
        :draggable="false"
        :header="t('currencyWars.form.tasks')"
        :close-button-props="{ 'aria-label': t('currencyWars.form.cancelSelection') }"
        :style="{
          width: '560px',
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'calc(100dvh - 32px)',
        }"
        :pt="{
          content: {
            style: { display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '0' },
          },
        }"
        @hide="selection.cancel"
      >
        <div class="currency-selection-toolbar">
          <span id="currency-draft-count" aria-live="polite">
            {{
              t('currencyWars.form.selection', {
                selected: selection.taskIds.length,
                total: data.tasks.length,
              })
            }}
          </span>
          <div class="currency-selection-actions">
            <Button
              type="button"
              size="small"
              severity="secondary"
              text
              :label="t('currencyWars.form.selectAll')"
              @click="selection.selectAll"
            />
            <Button
              type="button"
              size="small"
              severity="secondary"
              text
              :label="t('currencyWars.form.clear')"
              @click="selection.clear"
            />
          </div>
        </div>
        <div class="currency-task-options">
          <fieldset v-for="group in groups" :key="group.type">
            <legend>{{ t(`currencyWars.type.${group.type}`) }}</legend>
            <div
              v-for="task in group.tasks"
              :key="task.id"
              class="currency-check currency-task-option"
            >
              <Checkbox
                v-model="selection.taskIds"
                :value="task.id"
                :input-id="`currency-task-${task.id}`"
                :pt="{
                  input: {
                    'aria-describedby': selection.taskIds.length
                      ? 'currency-draft-count'
                      : 'currency-draft-count currency-draft-empty',
                  },
                }"
              />
              <label :for="`currency-task-${task.id}`">
                <CurrencyTrait
                  :source="visuals?.traitUrl(task.traitId)"
                  :name="traitName(task.traitId)"
                />
                <span class="currency-option-threshold">{{
                  t('currencyWars.form.required', { count: task.requiredCount })
                }}</span>
              </label>
            </div>
          </fieldset>
        </div>
        <template #footer>
          <div class="currency-selection-footer">
            <p v-if="!selection.taskIds.length" id="currency-draft-empty" class="currency-error">
              {{ t('currencyWars.validation.taskIds') }}
            </p>
            <div class="currency-selection-actions">
              <Button
                type="button"
                severity="secondary"
                text
                :label="t('currencyWars.form.cancelSelection')"
                @click="selection.cancel"
              />
              <Button
                type="button"
                :label="t('currencyWars.form.confirmSelection')"
                @click="selection.confirm"
              />
            </div>
          </div>
        </template>
      </Dialog>
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
          v-if="state.lastValid && state.selectedSolution"
          :snapshot="data.snapshot"
          :catalog="data.visuals"
          :attempt="state.lastValid"
          :solution="state.selectedSolution"
          :selected-index="state.selectedSolutionIndex"
          @select="state.selectSolution"
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
  grid-template-columns: 320px minmax(0, 1fr);
  align-items: start;
  gap: 24px;
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
.currency-help {
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
  font-size: 17px;
  color: var(--color-ink);
}
.currency-selection-actions {
  display: flex;
  gap: 4px;
  margin: 4px 0;
}
.currency-task-summary {
  padding: 0 8px;
  margin: 12px 0;
  max-height: 300px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  list-style: none;
  border: 1px solid var(--color-line);
  border-radius: 6px;
}
.currency-task-summary li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  height: 54px;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-line) 45%, transparent);
}
.currency-task-summary li:last-child {
  border-bottom: 0;
}
.currency-selected-task {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.currency-selected-trait {
  --trait-icon-size: 32px;
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
}
.currency-selected-task :deep(.currency-trait-name) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.currency-task-threshold {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.currency-remove-task {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
}
.currency-edit-tasks {
  width: 100%;
  margin-top: 8px;
}
.currency-limits {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--color-line);
}
.currency-limits h3 {
  margin-bottom: 16px;
}
.currency-limits .currency-field:last-child {
  margin-bottom: 0;
}
.currency-experts {
  margin-top: 12px;
  flex-wrap: wrap;
  font-size: 13px;
}
.currency-help-button {
  width: 28px;
  height: 28px;
}
.currency-task-option label {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.currency-option-threshold {
  flex-shrink: 0;
  color: var(--color-muted);
  font-size: 12px;
}
.currency-selection-toolbar,
.currency-selection-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  font-size: 13px;
}
.currency-selection-footer .currency-selection-actions {
  margin-left: auto;
}
.currency-selection-toolbar {
  flex-shrink: 0;
}
.currency-task-options {
  max-height: 55dvh;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 20px;
  padding: 12px 4px;
  scrollbar-gutter: stable;
}
.currency-task-options fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.currency-task-options legend {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}
.currency-task-option {
  font-size: 13px;
  margin-bottom: 12px;
}
.currency-task-option label {
  overflow-wrap: anywhere;
}
.currency-run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 20px 0 10px;
}
.currency-run-actions > :first-child {
  flex: 1;
}
.currency-advanced {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-line);
  font-size: 13px;
}
.currency-advanced summary {
  cursor: pointer;
  color: var(--color-muted);
}
.currency-advanced .currency-field {
  margin: 16px 0 12px;
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
@media (min-width: 960px) and (max-width: 1199px) {
  .currency-workspace {
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 20px;
  }
}
@media (max-width: 959px) {
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
