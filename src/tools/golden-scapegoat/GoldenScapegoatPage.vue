<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Slider from 'primevue/slider'
import { createSearchSession } from './browser/session'
import EditorPalette from './components/EditorPalette.vue'
import PuzzleGrid from './components/PuzzleGrid.vue'
import ReplayPanel from './components/ReplayPanel.vue'
import { demos } from './demos'
import {
  editMap,
  ensureGroup,
  type BasicTool,
  type Brush,
  type EditIssue,
  type PlatformTool,
  type PortalTool,
} from './editor'
import {
  authoredCells,
  coordinateLimit,
  emptyMap,
  mapFileLimit,
  readinessIssues,
  readMap,
  writeMap,
  type Cell,
  type PuzzleMap,
  type ReadyMap,
} from './engine/map'
import { defaultLimits, maximumLimits } from './engine/solve'
import { boardStatus, compileMap } from './engine/step'
import {
  clampOrigin,
  groupChoices,
  mapBounds,
  replayWindow,
  windowLimit,
  type GroupChoice,
} from './presentation'

const { t } = useI18n()
const g = 'goldenScapegoat'
const map = shallowRef<PuzzleMap>(emptyMap())
const editView = ref({ x: 0, y: 0, width: 12, height: 8, size: 44 })
const viewFields = ['x', 'y', 'width', 'height'] as const
const brush = shallowRef<Brush>({ tool: 'floor' })
const groupSelection = shallowRef<Pick<GroupChoice, 'kind' | 'id'>>()
const anchor = ref<Cell | null>(null)
const demo = ref<keyof typeof demos>()
const k = ref<number | null>(map.value.k)
const stateLimit = ref<number | null>(defaultLimits.states)
const timeLimit = ref<number | null>(defaultLimits.milliseconds / 1000)
const fileInput = ref<HTMLInputElement>()
const issues = shallowRef<EditIssue[]>([])
let importGeneration = 0

const search = createSearchSession(
  () => new Worker(new URL('./browser/search.worker.ts', import.meta.url), { type: 'module' }),
)
const { status } = search
const mode = ref<'edit' | 'replay'>('edit')
const frameIndex = ref(0)
const solution = computed(() => (status.value.status === 'solved' ? status.value : undefined))
const snapshot = computed(() =>
  mode.value === 'replay' ? solution.value?.frames[frameIndex.value]?.nextState : undefined,
)
const ready = computed(() => readinessIssues(map.value))
const compiled = computed(() =>
  !ready.value.length ? compileMap(map.value as ReadyMap) : undefined,
)
const frameStatus = computed(() =>
  snapshot.value && compiled.value ? boardStatus(compiled.value, snapshot.value) : undefined,
)
const bounds = computed(() => mapBounds(authoredCells(map.value)))
const view = computed(() =>
  snapshot.value ? replayWindow(bounds.value, snapshot.value) : editView.value,
)
const validK = computed(() => k.value !== null && Number.isSafeInteger(k.value) && k.value > 0)
const validLimits = computed(
  () =>
    stateLimit.value !== null &&
    Number.isSafeInteger(stateLimit.value) &&
    stateLimit.value >= 1 &&
    stateLimit.value <= maximumLimits.states &&
    timeLimit.value !== null &&
    Number.isInteger(timeLimit.value) &&
    timeLimit.value >= 1 &&
    timeLimit.value <= maximumLimits.milliseconds / 1000,
)

const demoOptions = computed(() =>
  (Object.keys(demos) as (keyof typeof demos)[]).map((value) => ({
    value,
    label: t(`${g}.demo.${value}`),
  })),
)
const platforms = computed(() => groupChoices('platform', map.value.platformGroups))
const portals = computed(() => groupChoices('portal', map.value.portalPairs))
const slots = computed(() => [...platforms.value.slots, ...portals.value.slots])
const extras = computed(() => [...platforms.value.extras, ...portals.value.extras])
const selectedGroup = computed(() => {
  const selection = groupSelection.value
  if (!selection) return
  const choices = selection.kind === 'platform' ? platforms.value : portals.value
  return choices.byIndex.find(({ id }) => id === selection.id)
})
const selectedPortal = computed(() => {
  const group = selectedGroup.value
  return group?.kind === 'portal' ? map.value.portalPairs[group.index] : undefined
})

const feedback = computed(() => {
  const result = status.value
  if (result.status === 'idle') return ''
  if (result.status === 'resource_limit')
    return t(`${g}.result.${result.reason}`, { visited: result.visited })
  if (result.status === 'solved') return t(`${g}.result.solved`, { steps: result.actions.length })
  if ('visited' in result) return t(`${g}.result.${result.status}`, { visited: result.visited })
  return t(`${g}.result.${result.status}`)
})

function updateView(field: (typeof viewFields)[number], value: number | null) {
  if (value === null) return
  if (field === 'width' || field === 'height')
    editView.value[field] = Math.min(windowLimit, Math.max(4, Math.round(value)))
  else editView.value[field] = Math.round(value)
  editView.value.x = clampOrigin(editView.value.x, editView.value.width)
  editView.value.y = clampOrigin(editView.value.y, editView.value.height)
}

function fitMap() {
  const { x, y, width, height } = bounds.value
  updateView('width', Math.max(editView.value.width, width))
  updateView('height', Math.max(editView.value.height, height))
  updateView(
    'x',
    width <= windowLimit ? x : (map.value.start?.x ?? x) - Math.floor(windowLimit / 2),
  )
  updateView(
    'y',
    height <= windowLimit ? y : (map.value.start?.y ?? y) - Math.floor(windowLimit / 2),
  )
}

function commit(next: PuzzleMap) {
  if (next === map.value) return
  importGeneration++
  map.value = next
  demo.value = undefined
  mode.value = 'edit'
  frameIndex.value = 0
  issues.value = []
  search.reset()
}

function selectBasic(tool: BasicTool) {
  if (brush.value.tool !== tool) anchor.value = null
  groupSelection.value = undefined
  brush.value = { tool }
}

function selectGroup(choice: GroupChoice) {
  if (selectedGroup.value === choice) return
  commit(ensureGroup(map.value, choice.kind, choice.id))
  groupSelection.value = { kind: choice.kind, id: choice.id }
  brush.value = {
    tool: choice.kind === 'platform' ? 'platformPressed' : 'portal',
    groupId: choice.id,
  }
  anchor.value = null
}

function selectGroupTool(tool: PlatformTool | PortalTool) {
  if (selectedGroup.value) brush.value = { tool, groupId: selectedGroup.value.id }
}

function updatePortal(initiallyOpen: boolean) {
  const pair = selectedPortal.value
  if (!pair || pair.initiallyOpen === initiallyOpen) return
  const portalPairs = map.value.portalPairs.map((row) =>
    row === pair ? { ...row, initiallyOpen } : row,
  )
  commit({ ...map.value, portalPairs })
}

function load(next: PuzzleMap) {
  if (next === map.value) return
  commit(next)
  k.value = next.k
  selectBasic('floor')
  anchor.value = null
  fitMap()
}

function loadDemo(value: keyof typeof demos) {
  load(demos[value])
  demo.value = value
}

function changeK(value: number | null) {
  if (value !== null && Number.isSafeInteger(value) && value > 0) {
    if (value !== map.value.k) commit({ ...map.value, k: value })
  } else {
    search.reset()
    mode.value = 'edit'
  }
  k.value = value
}

function editCell(point: Cell) {
  const result = editMap(map.value, brush.value, point, anchor.value)
  if (result.issue) {
    issues.value = [result.issue]
    return
  }
  if (result.map) commit(result.map)
  else issues.value = []
  anchor.value = result.anchor ?? null
}

async function importMap(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const generation = ++importGeneration
  try {
    const result =
      file.size > mapFileLimit
        ? { issues: [{ code: 'fileLimit', path: '$' }] as EditIssue[] }
        : readMap(await file.text())
    if (generation !== importGeneration) return
    if ('map' in result && result.map && !result.issues.length) {
      load(result.map)
    } else issues.value = result.issues
  } catch {
    if (generation === importGeneration) issues.value = [{ code: 'json', path: '$' }]
  }
}

function exportMap() {
  const source = writeMap(map.value)
  if (source === undefined) {
    issues.value = [{ code: 'fileLimit', path: '$' }]
    return
  }
  const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'golden-scapegoat.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function begin() {
  if (ready.value.length || !validK.value || !validLimits.value) return
  frameIndex.value = 0
  search.start(map.value as ReadyMap, {
    states: stateLimit.value!,
    milliseconds: timeLimit.value! * 1000,
  })
}

function showFrame(index: number) {
  if (!solution.value) return
  frameIndex.value = Math.min(solution.value.actions.length, Math.max(0, index))
  mode.value = 'replay'
}

watch(solution, (result) => {
  if (result) showFrame(0)
})
onBeforeUnmount(() => {
  importGeneration++
  search.reset()
})
</script>

<template>
  <article class="goat-page">
    <header class="page-header">
      <h1>{{ t(`${g}.title`) }}</h1>
      <div class="controls">
        <Button
          :label="t(`${g}.editor`)"
          size="small"
          :severity="mode === 'edit' ? 'primary' : 'secondary'"
          :aria-pressed="mode === 'edit'"
          @click="mode = 'edit'"
        />
        <Button
          :label="t(`${g}.replay`)"
          size="small"
          :severity="mode === 'replay' ? 'primary' : 'secondary'"
          :aria-pressed="mode === 'replay'"
          :disabled="!solution"
          @click="showFrame(frameIndex)"
        />
      </div>
    </header>

    <div v-if="mode === 'edit'" class="controls map-actions">
      <Select
        :model-value="demo"
        :options="demoOptions"
        option-label="label"
        option-value="value"
        :placeholder="t(`${g}.demo.label`)"
        :aria-label="t(`${g}.demo.label`)"
        size="small"
        @update:model-value="loadDemo"
      />
      <Button
        :label="t(`${g}.clear`)"
        severity="secondary"
        size="small"
        @click="load(emptyMap())"
      />
      <input
        ref="fileInput"
        type="file"
        accept=".json,application/json"
        hidden
        @change="importMap"
      />
      <Button
        :label="t(`${g}.import`)"
        severity="secondary"
        size="small"
        @click="fileInput?.click()"
      />
      <Button
        :label="t(`${g}.export`)"
        severity="secondary"
        size="small"
        :disabled="!validK"
        @click="exportMap"
      />
    </div>

    <div v-if="issues.length" class="notice" role="alert">
      <ul>
        <li v-for="(issue, index) in issues" :key="index">
          {{ t(`${g}.issues.${issue.code}`) }} <code>{{ issue.path }}</code>
          <span v-if="issue.cell"> {{ t(`${g}.coordinate`, { ...issue.cell }) }}</span>
        </li>
      </ul>
      <Button :label="t(`${g}.dismiss`)" text size="small" @click="issues = []" />
    </div>

    <div class="workspace" :class="`workspace-${mode}`">
      <aside v-if="mode === 'edit'" class="panel settings" :aria-label="t(`${g}.editor`)">
        <div class="solve-row">
          <label for="goat-k">
            {{ t(`${g}.k`) }}
            <InputNumber
              input-id="goat-k"
              :model-value="k"
              :min="1"
              :use-grouping="false"
              fluid
              size="small"
              :invalid="!validK"
              :pt="{
                pcInputText: { root: { 'aria-describedby': !validK ? 'goat-k-error' : undefined } },
              }"
              @update:model-value="changeK"
            />
          </label>
          <Button
            v-if="status.status === 'searching'"
            :label="t(`${g}.cancel`)"
            severity="secondary"
            @click="search.cancel"
          />
          <Button
            v-else
            :label="t(`${g}.solve`)"
            :disabled="!!ready.length || !validK || !validLimits"
            @click="begin"
          />
        </div>
        <p v-if="!validK" id="goat-k-error" class="error">{{ t(`${g}.issues.k`) }}</p>
        <div role="status">
          <p v-if="status.status !== 'idle'" class="hint">{{ feedback }}</p>
        </div>
        <ul v-if="ready.length" class="hint readiness">
          <li v-for="issue in ready" :key="issue.path">
            {{ t(`${g}.issues.${issue.code}`) }}
            <code v-if="issue.code === 'pairIncomplete'">{{ issue.path }}</code>
          </li>
        </ul>

        <EditorPalette
          :brush="brush"
          :group="selectedGroup"
          :slots="slots"
          :extras="extras"
          :portal="selectedPortal"
          :anchor="anchor"
          @basic="selectBasic"
          @group="selectGroup"
          @tool="selectGroupTool"
          @portal-open="updatePortal"
          @cancel-ladder="anchor = null"
        />
        <details class="settings-detail">
          <summary>{{ t(`${g}.searchSettings`) }}</summary>
          <div class="numeric-fields">
            <label for="goat-max-states">
              {{ t(`${g}.stateLimit`) }}
              <InputNumber
                v-model="stateLimit"
                input-id="goat-max-states"
                :min="1"
                :max="maximumLimits.states"
                size="small"
                fluid
              />
            </label>
            <label for="goat-max-time">
              {{ t(`${g}.timeLimit`) }}
              <InputNumber
                v-model="timeLimit"
                input-id="goat-max-time"
                :min="1"
                :max="maximumLimits.milliseconds / 1000"
                size="small"
                fluid
              />
            </label>
          </div>
        </details>
      </aside>

      <section class="panel grid-panel" :aria-label="t(`${g}.board`)">
        <PuzzleGrid
          :map="map"
          :view="view"
          :size="editView.size"
          :editable="mode === 'edit'"
          :anchor="mode === 'edit' ? anchor : null"
          :snapshot="snapshot"
          :status="frameStatus"
          :platform-groups="platforms.byIndex"
          :portal-groups="portals.byIndex"
          @cell="editCell"
        />
        <details v-if="mode === 'edit'" class="settings-detail">
          <summary>{{ t(`${g}.viewport`) }}</summary>
          <div class="viewport-fields numeric-fields">
            <label v-for="field in viewFields" :key="field" :for="`goat-view-${field}`">
              {{ t(`${g}.view.${field}`) }}
              <InputNumber
                :input-id="`goat-view-${field}`"
                :model-value="editView[field]"
                :min="field === 'x' || field === 'y' ? -coordinateLimit : 4"
                :max="field === 'x' || field === 'y' ? coordinateLimit : windowLimit"
                size="small"
                fluid
                :use-grouping="false"
                @update:model-value="updateView(field, $event)"
              />
            </label>
            <label class="zoom">
              {{ t(`${g}.zoom`) }}
              <Slider v-model="editView.size" :min="32" :max="72" :aria-label="t(`${g}.zoom`)" />
            </label>
            <Button :label="t(`${g}.fit`)" severity="secondary" size="small" @click="fitMap" />
          </div>
        </details>
      </section>

      <aside v-if="mode === 'replay' && solution" class="panel" :aria-label="t(`${g}.replay`)">
        <ReplayPanel
          :map="map"
          :solution="solution"
          :frame-index="frameIndex"
          :platform-groups="platforms.byIndex"
          :portal-groups="portals.byIndex"
          @frame="showFrame"
        />
      </aside>
    </div>
  </article>
</template>

<style scoped>
.goat-page {
  max-inline-size: 1440px;
  margin-inline: auto;
  padding: clamp(14px, 3vw, 36px);
}
.page-header,
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.page-header {
  justify-content: space-between;
  margin-block-end: 12px;
}
.map-actions {
  margin-block-end: 12px;
}
h1 {
  color: var(--color-ink);
  font-size: clamp(1.35rem, 4vw, 1.8rem);
  font-weight: 700;
}
.workspace {
  display: grid;
  gap: 12px;
  align-items: start;
}
.workspace-edit {
  grid-template-columns: minmax(255px, 310px) minmax(0, 1fr);
}
.workspace-replay {
  grid-template-columns: minmax(0, 1fr) minmax(295px, 370px);
}
.panel {
  min-inline-size: 0;
  padding: 12px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-surface);
}
.settings,
.grid-panel,
.numeric-fields {
  display: grid;
  gap: 8px;
}
.solve-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
}
label,
summary {
  font-size: 0.875rem;
}
.settings-detail {
  border-block-start: 1px solid var(--color-line);
  padding-block-start: 8px;
}
summary {
  cursor: pointer;
}
.hint,
.error,
.notice li {
  font-size: 0.8125rem;
}
.hint {
  color: var(--color-muted);
}
.settings [role='status']:empty {
  display: none;
}
.readiness {
  list-style: disc;
  padding-inline-start: 1.2em;
}
.error,
.notice code {
  color: var(--color-delay);
}
.notice {
  margin-block-end: 12px;
  padding: 8px 12px;
  border: 1px solid var(--color-delay);
  border-radius: 6px;
}
.notice ul {
  max-block-size: 14rem;
  overflow: auto;
}
.numeric-fields {
  margin-block-start: 8px;
}
.viewport-fields {
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  align-items: end;
}
.zoom {
  padding-inline: 6px;
  padding-block-end: 9px;
}
.zoom > :deep([data-pc-name='slider']) {
  margin-block-start: 12px;
}
code {
  overflow-wrap: anywhere;
}
@media (max-width: 780px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
