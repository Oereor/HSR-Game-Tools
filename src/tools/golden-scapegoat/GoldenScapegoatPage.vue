<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import ButtonGroup from 'primevue/buttongroup'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LocateFixed } from '@lucide/vue'
import Select from 'primevue/select'
import Slider from 'primevue/slider'
import { createSearchSession } from './browser/session'
import EditorProperties from './components/EditorProperties.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import EditorWorkspace from './components/EditorWorkspace.vue'
import PuzzleGrid from './components/PuzzleGrid.vue'
import ReplayPanel from './components/ReplayPanel.vue'
import { demos } from './demos'
import {
  editMap,
  ensureGroup,
  parseRecordSteps,
  type BasicTool,
  type Brush,
  type EditIssue,
  type PlatformTool,
  type PortalTool,
} from './editor'
import {
  authoredCells,
  emptyMap,
  mapFileLimit,
  prepareMap,
  readMap,
  validRecordSteps,
  writeMap,
  type Cell,
  type MapIssue,
  type PuzzleMap,
} from './engine/map'
import { defaultLimits } from './engine/solve'
import { boardStatus, compileMap, type Direction } from './engine/step'
import {
  clampOrigin,
  groupChoices,
  groupDetail,
  locateEditWindow,
  mapBounds,
  panEditWindow,
  replayWindow,
  windowLimit,
  type BoardScroll,
  type GroupChoice,
} from './presentation'

const { t } = useI18n()
const g = 'goldenScapegoat'
const map = shallowRef<PuzzleMap>(emptyMap())
const editView = ref({ x: 0, y: 0, width: 12, height: 8, size: 44 })
const viewFields = ['width', 'height'] as const
const panControls = [
  { direction: 'left', icon: ArrowLeft },
  { direction: 'up', icon: ArrowUp },
  { direction: 'down', icon: ArrowDown },
  { direction: 'right', icon: ArrowRight },
] as const
const editScroll = shallowRef<BoardScroll>()
const replayScroll = shallowRef<BoardScroll>()
const brush = shallowRef<Brush>({ tool: 'floor' })
const platformPolarity = ref<'platformPressed' | 'platformReleased'>('platformPressed')
const groupSelection = shallowRef<Pick<GroupChoice, 'kind' | 'id'>>()
const anchor = ref<Cell | null>(null)
const demo = ref<keyof typeof demos>()
const kInput = ref<number | null>(null)
const invalidK = ref(false)
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
const snapshot = computed(() => solution.value?.frames[frameIndex.value]?.nextState)
const readiness = computed(() => prepareMap(map.value))
const readyMap = computed(() => readiness.value.map)
const compiled = computed(() => (readyMap.value ? compileMap(readyMap.value) : undefined))
const frameStatus = computed(() =>
  snapshot.value && compiled.value ? boardStatus(compiled.value, snapshot.value) : undefined,
)
const bounds = computed(() => mapBounds(authoredCells(map.value)))
const replayView = computed(() =>
  snapshot.value ? replayWindow(bounds.value, snapshot.value) : undefined,
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

function todoMessage(issue: MapIssue) {
  if (issue.code === 'k' && !invalidK.value) return t(`${g}.todo.k`)
  const choices = issue.group?.kind === 'platform' ? platforms.value : portals.value
  const group = issue.group ? groupDetail(choices.byIndex[issue.group.index], t) : ''
  const at = issue.cell ? t(`${g}.coordinate`, { ...issue.cell }) : ''
  return t(`${g}.issues.${issue.code}`, { group, at })
}

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
  editView.value[field] = Math.min(windowLimit, Math.max(4, Math.round(value)))
  editView.value.x = clampOrigin(editView.value.x, editView.value.width)
  editView.value.y = clampOrigin(editView.value.y, editView.value.height)
}

function panMap(direction: Direction) {
  Object.assign(editView.value, panEditWindow(editView.value, direction))
}

function fitMap() {
  Object.assign(editView.value, locateEditWindow(editView.value, bounds.value, map.value.start))
  editScroll.value = { left: 0, top: 0 }
}

function commit(next: PuzzleMap) {
  if (next === map.value) return
  importGeneration++
  map.value = next
  demo.value = undefined
  mode.value = 'edit'
  frameIndex.value = 0
  replayScroll.value = undefined
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
  platformPolarity.value = 'platformPressed'
  groupSelection.value = { kind: choice.kind, id: choice.id }
  brush.value = {
    tool: choice.kind === 'platform' ? 'platformPressed' : 'portal',
    groupId: choice.id,
  }
  anchor.value = null
}

function selectGroupTool(tool: PlatformTool | PortalTool) {
  if (tool === 'platformPressed' || tool === 'platformReleased') platformPolarity.value = tool
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
  kInput.value = next.k
  invalidK.value = false
  selectBasic('floor')
  anchor.value = null
  fitMap()
}

function loadDemo(value: keyof typeof demos) {
  load(demos[value])
  demo.value = value
}

function changeK(value: unknown) {
  const k = validRecordSteps(value) ? value : null
  kInput.value = typeof value === 'number' && Number.isFinite(value) ? value : null
  invalidK.value = k === null && value != null && value !== ''
  if (k !== map.value.k) commit({ ...map.value, k })
}

function checkKPaste(event: ClipboardEvent) {
  if (!(event.target instanceof HTMLInputElement) || event.target.id !== 'goat-k') return
  const text = event.clipboardData?.getData('text')
  if (text === undefined || parseRecordSteps(text) !== null) return
  event.preventDefault()
  event.stopPropagation()
  changeK(text.trim())
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
  const ready = readyMap.value
  if (!ready) return
  frameIndex.value = 0
  replayScroll.value = undefined
  search.start(ready, defaultLimits)
}

function switchMode(value: string | number) {
  if (value === 'edit' || (value === 'replay' && solution.value)) mode.value = value
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
      <div v-if="mode === 'edit'" class="map-actions">
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
          text
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
          text
          size="small"
          @click="fileInput?.click()"
        />
        <Button
          :label="t(`${g}.export`)"
          severity="secondary"
          text
          size="small"
          @click="exportMap"
        />
      </div>
    </header>

    <Tabs :value="mode" @update:value="switchMode">
      <TabList :aria-label="t('ui.stage')">
        <Tab value="edit">{{ t(`${g}.editor`) }}</Tab>
        <Tab value="replay" :disabled="!solution">{{ t(`${g}.replay`) }}</Tab>
      </TabList>
      <TabPanels class="workspace-tabs">
        <TabPanel value="edit">
          <div class="edit-content">
            <div v-if="issues.length" class="notice" role="alert">
              <ul>
                <li v-for="(issue, index) in issues" :key="index">
                  {{ t(`${g}.issues.${issue.code}`) }} <code>{{ issue.path }}</code>
                  <span v-if="issue.cell"> {{ t(`${g}.coordinate`, { ...issue.cell }) }}</span>
                </li>
              </ul>
              <Button
                :label="t(`${g}.dismiss`)"
                severity="secondary"
                text
                size="small"
                @click="issues = []"
              />
            </div>
            <EditorToolbar
              :brush="brush"
              :group="selectedGroup"
              :slots="slots"
              :extras="extras"
              @basic="selectBasic"
              @group="selectGroup"
            />
            <EditorWorkspace>
              <template #map>
                <section class="map-pane" aria-labelledby="goat-map">
                  <header class="map-heading">
                    <h2 id="goat-map">{{ t(`${g}.board`) }}</h2>
                    <div class="viewport-controls">
                      <label v-for="field in viewFields" :key="field" :for="`goat-view-${field}`">
                        {{ t(`${g}.view.${field}`) }}
                        <InputNumber
                          :input-id="`goat-view-${field}`"
                          :model-value="editView[field]"
                          :min="4"
                          :max="windowLimit"
                          size="small"
                          fluid
                          :allow-empty="false"
                          :use-grouping="false"
                          class="viewport-number"
                          @update:model-value="updateView(field, $event)"
                        />
                      </label>
                      <div class="zoom">
                        <span id="goat-zoom">{{ t(`${g}.zoom`) }}</span>
                        <Slider
                          v-model="editView.size"
                          :min="32"
                          :max="72"
                          aria-labelledby="goat-zoom"
                        />
                      </div>
                    </div>
                  </header>
                  <PuzzleGrid
                    class="edit-grid"
                    :map="map"
                    :view="editView"
                    :size="editView.size"
                    :active="mode === 'edit'"
                    editable
                    :anchor="anchor"
                    :platform-groups="platforms.byIndex"
                    :portal-groups="portals.byIndex"
                    :scroll-position="editScroll"
                    @cell="editCell"
                    @scroll-change="editScroll = $event"
                  />
                  <div class="board-navigation">
                    <ButtonGroup :aria-label="t(`${g}.view.navigation`)">
                      <Button
                        v-for="{ direction, icon } in panControls"
                        :key="direction"
                        type="button"
                        severity="secondary"
                        size="small"
                        outlined
                        :title="t(`${g}.view.pan.${direction}`)"
                        :aria-label="t(`${g}.view.pan.${direction}`)"
                        @click="panMap(direction)"
                      >
                        <template #icon
                          ><component :is="icon" :size="15" aria-hidden="true"
                        /></template>
                      </Button>
                      <Button
                        type="button"
                        severity="secondary"
                        size="small"
                        outlined
                        :title="t(`${g}.fit`)"
                        :aria-label="t(`${g}.fit`)"
                        @click="fitMap"
                      >
                        <template #icon><LocateFixed :size="15" aria-hidden="true" /></template>
                      </Button>
                    </ButtonGroup>
                  </div>
                </section>
              </template>
              <template #inspector>
                <aside class="inspector-pane" :aria-label="t('ui.inspector')">
                  <div class="inspector-upper">
                    <div class="inspector-main">
                      <EditorProperties
                        :brush="brush"
                        :group="selectedGroup"
                        :portal="selectedPortal"
                        :platform-polarity="platformPolarity"
                        :anchor="anchor"
                        @tool="selectGroupTool"
                        @portal-open="updatePortal"
                        @cancel-ladder="anchor = null"
                      />
                      <div aria-live="polite">
                        <section
                          v-if="readiness.issues.length"
                          class="todo"
                          aria-labelledby="goat-todo"
                        >
                          <h2 id="goat-todo">{{ t(`${g}.todo.title`) }}</h2>
                          <ul class="hint readiness">
                            <li
                              v-for="(issue, index) in readiness.issues"
                              :id="issue.code === 'k' ? 'goat-k-issue' : undefined"
                              :key="index"
                            >
                              {{ todoMessage(issue) }}
                            </li>
                          </ul>
                        </section>
                      </div>
                    </div>
                    <div class="hint inspector-feedback" role="status">{{ feedback }}</div>
                  </div>
                  <div class="solve-section" @paste.capture="checkKPaste">
                    <i18n-t
                      :keypath="`${g}.recordRule`"
                      tag="label"
                      for="goat-k"
                      scope="global"
                      class="record-rule"
                    >
                      <template #steps>
                        <InputNumber
                          input-id="goat-k"
                          class="step-input"
                          size="small"
                          fluid
                          :model-value="kInput"
                          :allow-empty="true"
                          :use-grouping="false"
                          :max-fraction-digits="20"
                          :aria-label="t(`${g}.k`)"
                          :pt="{
                            pcInputText: {
                              root: {
                                'aria-describedby': map.k === null ? 'goat-k-issue' : undefined,
                              },
                            },
                          }"
                          :invalid="invalidK"
                          @input="changeK($event.value)"
                          @update:model-value="changeK"
                        />
                      </template>
                    </i18n-t>
                    <Button
                      v-if="status.status === 'searching'"
                      :label="t(`${g}.cancel`)"
                      severity="secondary"
                      fluid
                      @click="search.cancel"
                    />
                    <Button
                      v-else
                      :label="t(`${g}.solve`)"
                      :disabled="!readyMap"
                      fluid
                      @click="begin"
                    />
                  </div>
                </aside>
              </template>
            </EditorWorkspace>
          </div>
        </TabPanel>

        <TabPanel value="replay">
          <div v-if="solution && readyMap && replayView" class="replay-workspace">
            <section class="replay-map" :aria-label="t(`${g}.board`)">
              <PuzzleGrid
                :map="readyMap"
                :view="replayView"
                :size="44"
                :active="mode === 'replay'"
                :editable="false"
                :anchor="null"
                :platform-groups="platforms.byIndex"
                :portal-groups="portals.byIndex"
                :snapshot="snapshot"
                :status="frameStatus"
                :scroll-position="replayScroll"
                @scroll-change="replayScroll = $event"
              />
            </section>
            <aside class="replay-aside" :aria-label="t(`${g}.replay`)">
              <ReplayPanel
                :map="readyMap"
                :solution="solution"
                :frame-index="frameIndex"
                :platform-groups="platforms.byIndex"
                :portal-groups="portals.byIndex"
                @frame="showFrame"
              />
            </aside>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </article>
</template>

<style scoped>
.goat-page {
  max-inline-size: 1440px;
  margin-inline: auto;
  padding: clamp(12px, 2.5vw, 30px);
}
.page-header,
.map-actions,
.map-heading,
.viewport-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.page-header,
.map-heading {
  justify-content: space-between;
}
.page-header {
  margin-block-end: 10px;
}
.page-header h1 {
  font-size: clamp(1.3rem, 4vw, 1.75rem);
}
.map-actions :deep([data-pc-name='select']) {
  max-inline-size: 100%;
}
.workspace-tabs {
  padding: 10px 0 0;
  background: transparent;
}
.edit-content,
.replay-workspace {
  display: grid;
  min-inline-size: 0;
  gap: 10px;
}
.map-pane,
.inspector-pane,
.replay-map,
.replay-aside {
  min-inline-size: 0;
  padding: 12px;
  background: var(--color-surface);
}
.map-pane,
.inspector-pane {
  display: grid;
  min-block-size: 0;
}
.map-pane {
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 6px;
}
.map-heading h2,
.todo h2 {
  font-size: 0.875rem;
  font-weight: 650;
}
.viewport-controls label,
.zoom,
.record-rule {
  font-size: 0.875rem;
}
.viewport-controls label,
.zoom {
  display: flex;
  align-items: center;
  gap: 6px;
}
.viewport-number {
  inline-size: 3.35rem;
}
.zoom :deep([data-pc-name='slider']) {
  inline-size: clamp(48px, 8vw, 82px);
  margin-inline: 5px;
}
.edit-grid {
  min-block-size: 0;
}
.board-navigation {
  display: flex;
  justify-content: flex-end;
}
.inspector-pane {
  grid-template-rows: minmax(0, 1fr) auto;
}
.inspector-upper {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-block-size: 0;
}
.inspector-main {
  display: grid;
  align-content: start;
  gap: 10px;
  min-block-size: 0;
  overflow: auto;
  padding: 2px 4px 10px 2px;
  overscroll-behavior: contain;
}
.solve-section {
  display: grid;
  gap: 8px;
  padding-block-start: 10px;
  border-block-start: 1px solid var(--color-line);
}
.record-rule {
  line-height: 1.75;
}
.step-input {
  inline-size: 5rem;
  vertical-align: middle;
}
.hint,
.notice {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
.inspector-feedback {
  max-block-size: 4.5em;
  overflow: auto;
}
.inspector-feedback:not(:empty) {
  padding-block-end: 8px;
}
.readiness {
  list-style: disc;
  padding-inline-start: 1.2em;
  overflow-wrap: anywhere;
}
.notice,
.replay-map,
.replay-aside,
:deep(.editor-stack > .map-pane),
:deep(.editor-stack > .inspector-pane) {
  border: 1px solid var(--color-line);
  border-radius: 8px;
}
:deep(.editor-stack .inspector-upper) {
  block-size: clamp(7.5rem, 20dvh, 10rem);
}
.notice {
  padding: 7px 10px;
  border-color: var(--color-delay);
}
.notice ul {
  max-block-size: 9rem;
  overflow: auto;
}
.notice code {
  color: var(--color-delay);
  overflow-wrap: anywhere;
}
.replay-workspace {
  grid-template-columns: minmax(0, 1fr) minmax(295px, 350px);
  align-items: start;
}
@media (max-width: 900px) {
  .replay-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
