<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Slider from 'primevue/slider'
import PuzzleGrid from './components/PuzzleGrid.vue'
import { createSearchSession } from './browser/session'
import { demos } from './demos'
import { editMap, nextGroupId, tools, type EditIssue, type EditTool } from './editor'
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
import { boardStatus, compileMap, type Event as GameEvent } from './engine/step'

const { t } = useI18n()
const g = 'goldenScapegoat'
const map = shallowRef<PuzzleMap>(emptyMap())
const view = ref({ x: 0, y: 0, width: 12, height: 8, size: 44 })
const viewFields = ['x', 'y', 'width', 'height'] as const
const tool = ref<EditTool>('floor')
const erase = ref(false)
const anchor = ref<Cell | null>(null)
const demo = ref<keyof typeof demos>()
const platformId = ref<string>()
const portalId = ref<string>()
const k = ref<number | null>(map.value.k)
const stateLimit = ref<number | null>(defaultLimits.states)
const timeLimit = ref<number | null>(defaultLimits.milliseconds / 1000)
const fileInput = ref<HTMLInputElement>()
const puzzleGrid = ref<InstanceType<typeof PuzzleGrid>>()
const issues = shallowRef<EditIssue[]>([])
const copyFeedback = ref<'copied' | 'copyFailed'>()
let importGeneration = 0

const search = createSearchSession(
  () => new Worker(new URL('./browser/search.worker.ts', import.meta.url), { type: 'module' }),
)
const { status } = search
const mode = ref<'edit' | 'replay'>('edit')
const frameIndex = ref(0)
const solution = computed(() => (status.value.status === 'solved' ? status.value : undefined))
const frames = computed(() => solution.value?.frames ?? [])
const snapshot = computed(() =>
  mode.value === 'replay' ? frames.value[frameIndex.value] : undefined,
)
const ready = computed(() => readinessIssues(map.value))
const compiled = computed(() =>
  !ready.value.length ? compileMap(map.value as ReadyMap) : undefined,
)
const frameStatus = computed(() =>
  snapshot.value && compiled.value
    ? boardStatus(compiled.value, snapshot.value.nextState)
    : undefined,
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

const toolOptions = computed(() =>
  tools.map((value) => ({ value, label: t(`${g}.tools.${value}`) })),
)
const demoOptions = computed(() =>
  (Object.keys(demos) as (keyof typeof demos)[]).map((value) => ({
    value,
    label: t(`${g}.demo.${value}`),
  })),
)
const platformOptions = computed(() =>
  map.value.platformGroups.map(({ id }, index) => ({ id, label: `A${index + 1}` })),
)
const portalOptions = computed(() =>
  map.value.portalPairs.map(({ id }, index) => ({ id, label: `P${index + 1}` })),
)
const selectedPlatform = computed(() =>
  map.value.platformGroups.find(({ id }) => id === platformId.value),
)
const selectedPortal = computed(() => map.value.portalPairs.find(({ id }) => id === portalId.value))

const arrow = { left: '←', right: '→', up: '↑', down: '↓' }
const wasd = { left: 'A', right: 'D', up: 'W', down: 'S' }
const sequence = computed(() =>
  solution.value?.actions.map((direction) => arrow[direction]).join(' '),
)
const feedback = computed(() => {
  const result = status.value
  if (result.status === 'resource_limit')
    return t(`${g}.result.${result.reason}`, { visited: result.visited })
  if (result.status === 'solved') return t(`${g}.result.solved`, { steps: result.actions.length })
  if ('visited' in result) return t(`${g}.result.${result.status}`, { visited: result.visited })
  return t(`${g}.result.${result.status}`)
})

function clampOrigin(value: number, size: number) {
  return Math.max(-coordinateLimit, Math.min(value, coordinateLimit - size + 1))
}

function updateView(field: 'x' | 'y' | 'width' | 'height', value: number | null) {
  if (value === null) return
  if (field === 'width' || field === 'height')
    view.value[field] = Math.min(32, Math.max(4, Math.round(value)))
  else view.value[field] = Math.round(value)
  view.value.x = clampOrigin(view.value.x, view.value.width)
  view.value.y = clampOrigin(view.value.y, view.value.height)
}

function fitMap() {
  const points = authoredCells(map.value)
  if (!points.length) {
    updateView('x', 0)
    updateView('y', 0)
    return
  }
  let minX = points[0].x,
    maxX = minX,
    minY = points[0].y,
    maxY = minY
  for (const { x, y } of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  updateView(
    'x',
    maxX - minX < view.value.width
      ? minX
      : (map.value.start?.x ?? minX) - Math.floor(view.value.width / 2),
  )
  updateView(
    'y',
    maxY - minY < view.value.height
      ? minY
      : (map.value.start?.y ?? minY) - Math.floor(view.value.height / 2),
  )
}

function followFrame() {
  const state = snapshot.value?.nextState
  if (!state?.gold) return
  for (const [axis, size] of [
    ['x', view.value.width],
    ['y', view.value.height],
  ] as const) {
    const gold = state.gold[axis]
    const black = state.black?.[axis] ?? gold
    const lower = Math.abs(gold - black) < size ? Math.min(gold, black) : gold
    const upper = Math.abs(gold - black) < size ? Math.max(gold, black) : gold
    updateView(axis, Math.min(lower, Math.max(view.value[axis], upper - size + 1)))
  }
}

function commit(next: PuzzleMap) {
  importGeneration++
  map.value = next
  demo.value = undefined
  mode.value = 'edit'
  frameIndex.value = 0
  copyFeedback.value = undefined
  issues.value = []
  search.reset()
}

function load(next: PuzzleMap) {
  commit(next)
  k.value = next.k
  platformId.value = next.platformGroups[0]?.id
  portalId.value = next.portalPairs[0]?.id
  anchor.value = null
  fitMap()
}

function loadDemo(value: keyof typeof demos) {
  load(demos[value])
  demo.value = value
}

function clearBoard() {
  load(emptyMap())
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

function setErase(value: boolean) {
  erase.value = value
  mode.value = 'edit'
}

function editCell(point: Cell) {
  const group =
    tool.value === 'platform' || tool.value === 'platformSwitch' ? platformId.value : portalId.value
  const result = editMap(map.value, tool.value, point, erase.value, group, anchor.value)
  if (result.issue) {
    issues.value = [result.issue]
    return
  }
  if (result.map) commit(result.map)
  else issues.value = []
  anchor.value = result.anchor ?? null
}

function addPlatform() {
  const id = nextGroupId('platform', map.value.platformGroups)
  const group = { id, defaultEnabled: false, activatedEnabled: true, cells: [], controllers: [] }
  commit({ ...map.value, platformGroups: [...map.value.platformGroups, group] })
  platformId.value = id
  erase.value = false
  tool.value = 'platform'
}

function updatePlatform(setting: 'defaultEnabled' | 'activatedEnabled', value: boolean) {
  const platformGroups = map.value.platformGroups.map((group) =>
    group.id === platformId.value ? { ...group, [setting]: value } : group,
  )
  commit({ ...map.value, platformGroups })
}

function removePlatform() {
  const platformGroups = map.value.platformGroups.filter(({ id }) => id !== platformId.value)
  commit({ ...map.value, platformGroups })
  platformId.value = platformGroups[0]?.id
}

function addPortal() {
  const id = nextGroupId('portal', map.value.portalPairs)
  commit({
    ...map.value,
    portalPairs: [
      ...map.value.portalPairs,
      { id, initiallyOpen: false, ends: [], controllers: [] },
    ],
  })
  portalId.value = id
  erase.value = false
  tool.value = 'portal'
}

function updatePortal(initiallyOpen: boolean) {
  const portalPairs = map.value.portalPairs.map((pair) =>
    pair.id === portalId.value ? { ...pair, initiallyOpen } : pair,
  )
  commit({ ...map.value, portalPairs })
}

function removePortal() {
  const portalPairs = map.value.portalPairs.filter(({ id }) => id !== portalId.value)
  commit({ ...map.value, portalPairs })
  portalId.value = portalPairs[0]?.id
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
  mode.value = 'edit'
  copyFeedback.value = undefined
  search.start(map.value as ReadyMap, {
    states: stateLimit.value!,
    milliseconds: timeLimit.value! * 1000,
  })
}

async function locateFrame() {
  followFrame()
  await nextTick()
  puzzleGrid.value?.revealSheep()
}

function showFrame(index: number) {
  mode.value = 'replay'
  frameIndex.value = Math.min(frames.value.length - 1, Math.max(0, index))
  void locateFrame()
}

async function copySequence(format: 'arrow' | 'wasd') {
  const current = solution.value
  if (!current?.actions.length) return
  try {
    await navigator.clipboard.writeText(
      current.actions.map((action) => (format === 'arrow' ? arrow : wasd)[action]).join(' '),
    )
    if (current === solution.value) copyFeedback.value = 'copied'
  } catch {
    if (current === solution.value) copyFeedback.value = 'copyFailed'
  }
}

const coord = (point: Cell | null) => (point ? t(`${g}.coordinate`, { ...point }) : '—')
function eventText(event: GameEvent) {
  switch (event.type) {
    case 'move':
    case 'fall':
    case 'teleport':
      return t(`${g}.events.${event.type}`, {
        sheep: t(`${g}.sheep.${event.sheep}`),
        from: coord(event.from),
        to: coord(event.to),
      })
    case 'lost':
      return t(`${g}.events.${event.cause}`, {
        sheep: t(`${g}.sheep.${event.sheep}`),
        at: coord(event.at),
      })
    case 'platform':
      return t(`${g}.groupState`, {
        group: `A${event.group + 1}`,
        state: t(`${g}.states.${event.enabled ? 'on' : 'off'}`),
      })
    case 'portal':
      return t(`${g}.groupState`, {
        group: `P${event.pair + 1}`,
        state: t(`${g}.states.${event.open ? 'open' : 'closed'}`),
      })
    case 'spawn':
    case 'collision':
    case 'goal':
      return t(`${g}.events.${event.type}`, { at: coord(event.at) })
  }
}

watch([tool, erase], () => {
  anchor.value = null
})
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
        <Button :label="t(`${g}.clear`)" severity="secondary" size="small" @click="clearBoard" />
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
    </header>

    <div v-if="issues.length" class="notice" role="alert">
      <ul>
        <li v-for="(issue, index) in issues" :key="index">
          {{ t(`${g}.issues.${issue.code}`) }} <code>{{ issue.path }}</code>
          <span v-if="issue.cell"> {{ coord(issue.cell) }}</span>
        </li>
      </ul>
      <Button :label="t(`${g}.dismiss`)" text size="small" @click="issues = []" />
    </div>

    <div class="workspace">
      <aside class="panel settings">
        <h2>{{ t(`${g}.editor`) }}</h2>
        <label for="goat-k">{{ t(`${g}.k`) }}</label>
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
        <p v-if="!validK" id="goat-k-error" class="error">{{ t(`${g}.issues.k`) }}</p>

        <label for="goat-tool">{{ t(`${g}.element`) }}</label>
        <Select
          v-model="tool"
          input-id="goat-tool"
          :options="toolOptions"
          option-label="label"
          option-value="value"
          fluid
          size="small"
          @update:model-value="mode = 'edit'"
        />
        <div class="controls">
          <Button
            :label="t(`${g}.place`)"
            :severity="erase ? 'secondary' : 'primary'"
            :aria-pressed="!erase"
            size="small"
            @click="setErase(false)"
          />
          <Button
            :label="t(`${g}.erase`)"
            :severity="erase ? 'primary' : 'secondary'"
            :aria-pressed="erase"
            size="small"
            @click="setErase(true)"
          />
        </div>
        <p v-if="tool === 'ladder' && !erase" class="hint" aria-live="polite">
          {{ anchor ? t(`${g}.ladderSecond`, { at: coord(anchor) }) : t(`${g}.ladderFirst`) }}
          <Button
            v-if="anchor"
            :label="t(`${g}.cancel`)"
            text
            size="small"
            @click="anchor = null"
          />
        </p>

        <section class="group-form">
          <label for="goat-platform">{{ t(`${g}.platformGroups`) }}</label>
          <div class="controls">
            <Select
              v-model="platformId"
              input-id="goat-platform"
              :options="platformOptions"
              option-label="label"
              option-value="id"
              :placeholder="t(`${g}.none`)"
              size="small"
            />
            <Button :label="t(`${g}.add`)" outlined size="small" @click="addPlatform" />
            <Button
              v-if="selectedPlatform"
              :label="t(`${g}.remove`)"
              severity="danger"
              text
              size="small"
              @click="removePlatform"
            />
          </div>
          <div v-if="selectedPlatform" class="checks">
            <label for="goat-default-platform"
              ><Checkbox
                input-id="goat-default-platform"
                binary
                :model-value="selectedPlatform.defaultEnabled"
                @update:model-value="updatePlatform('defaultEnabled', $event)"
              />
              {{ t(`${g}.defaultEnabled`) }}</label
            >
            <label for="goat-activated-platform"
              ><Checkbox
                input-id="goat-activated-platform"
                binary
                :model-value="selectedPlatform.activatedEnabled"
                @update:model-value="updatePlatform('activatedEnabled', $event)"
              />
              {{ t(`${g}.activatedEnabled`) }}</label
            >
          </div>
        </section>
        <section class="group-form">
          <label for="goat-portal">{{ t(`${g}.portalPairs`) }}</label>
          <div class="controls">
            <Select
              v-model="portalId"
              input-id="goat-portal"
              :options="portalOptions"
              option-label="label"
              option-value="id"
              :placeholder="t(`${g}.none`)"
              size="small"
            />
            <Button :label="t(`${g}.add`)" outlined size="small" @click="addPortal" />
            <Button
              v-if="selectedPortal"
              :label="t(`${g}.remove`)"
              severity="danger"
              text
              size="small"
              @click="removePortal"
            />
          </div>
          <div v-if="selectedPortal" class="checks">
            <label for="goat-initially-open-portal"
              ><Checkbox
                input-id="goat-initially-open-portal"
                binary
                :model-value="selectedPortal.initiallyOpen"
                @update:model-value="updatePortal"
              />
              {{ t(`${g}.initiallyOpen`) }}</label
            >
          </div>
          <p v-if="selectedPortal" class="hint">
            {{ t(`${g}.ends`, { count: selectedPortal.ends.length }) }}
          </p>
        </section>
        <details class="group-form">
          <summary>{{ t(`${g}.searchSettings`) }}</summary>
          <div class="numeric-fields">
            <label for="goat-max-states">{{ t(`${g}.stateLimit`) }}</label>
            <InputNumber
              v-model="stateLimit"
              input-id="goat-max-states"
              :min="1"
              :max="maximumLimits.states"
              size="small"
              fluid
            />
            <label for="goat-max-time">{{ t(`${g}.timeLimit`) }}</label>
            <InputNumber
              v-model="timeLimit"
              input-id="goat-max-time"
              :min="1"
              :max="maximumLimits.milliseconds / 1000"
              size="small"
              fluid
            />
          </div>
        </details>
        <div class="controls">
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
        <ul v-if="ready.length" class="hint">
          <li v-for="issue in ready" :key="issue.path">
            {{ t(`${g}.issues.${issue.code}`) }} <code>{{ issue.path }}</code>
          </li>
        </ul>
      </aside>

      <section class="panel grid-panel">
        <div class="board-header">
          <h2>{{ t(`${g}.board`) }}</h2>
          <div class="controls" v-if="solution">
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
              @click="showFrame(frameIndex)"
            />
          </div>
        </div>

        <PuzzleGrid
          ref="puzzleGrid"
          :map="map"
          :origin="view"
          :width="view.width"
          :height="view.height"
          :size="view.size"
          :editable="mode === 'edit'"
          :anchor="mode === 'edit' ? anchor : null"
          :snapshot="snapshot?.nextState"
          :status="frameStatus"
          @cell="editCell"
        />

        <details class="viewport">
          <summary>{{ t(`${g}.viewport`) }}</summary>
          <div class="viewport-fields">
            <label v-for="field in viewFields" :key="field" :for="`goat-view-${field}`">
              {{ t(`${g}.view.${field}`) }}
              <InputNumber
                :input-id="`goat-view-${field}`"
                :model-value="view[field]"
                :min="field === 'x' || field === 'y' ? -coordinateLimit : 4"
                :max="field === 'x' || field === 'y' ? coordinateLimit : 32"
                size="small"
                fluid
                :use-grouping="false"
                @update:model-value="updateView(field, $event)"
              />
            </label>
            <label class="zoom">
              {{ t(`${g}.zoom`) }}
              <Slider v-model="view.size" :min="32" :max="72" :aria-label="t(`${g}.zoom`)" />
            </label>
            <Button
              :label="t(`${g}.fit`)"
              severity="secondary"
              size="small"
              @click="snapshot ? locateFrame() : fitMap()"
            />
          </div>
        </details>

        <section class="result" aria-live="polite">
          <p v-if="status.status !== 'idle'">{{ feedback }}</p>
          <template v-if="solution">
            <div v-if="solution.actions.length" class="controls">
              <Button
                :label="t(`${g}.copyArrow`)"
                severity="secondary"
                size="small"
                @click="copySequence('arrow')"
              />
              <Button
                :label="t(`${g}.copyWasd`)"
                severity="secondary"
                size="small"
                @click="copySequence('wasd')"
              />
              <span v-if="copyFeedback" class="hint">{{ t(`${g}.${copyFeedback}`) }}</span>
            </div>
            <p v-if="sequence" class="sequence">{{ sequence }}</p>
          </template>
        </section>
        <section v-if="snapshot && frameStatus" class="replay" aria-live="polite">
          <p>
            {{ t(`${g}.step`, { current: frameIndex, total: frames.length - 1 }) }} ·
            {{
              snapshot.nextState.phase === 'replaying'
                ? t(`${g}.replayProgress`, {
                    current: map.k - snapshot.nextState.history.length,
                    total: map.k,
                  })
                : t(`${g}.phase.${snapshot.nextState.phase}`)
            }}
            · K={{ map.k }}
          </p>
          <div class="controls">
            <Button
              :label="t(`${g}.first`)"
              severity="secondary"
              size="small"
              :disabled="frameIndex === 0"
              @click="showFrame(0)"
            />
            <Button
              :label="t(`${g}.previous`)"
              severity="secondary"
              size="small"
              :disabled="frameIndex === 0"
              @click="showFrame(frameIndex - 1)"
            />
            <Button
              :label="t(`${g}.next`)"
              severity="secondary"
              size="small"
              :disabled="frameIndex === frames.length - 1"
              @click="showFrame(frameIndex + 1)"
            />
            <Button
              :label="t(`${g}.last`)"
              severity="secondary"
              size="small"
              :disabled="frameIndex === frames.length - 1"
              @click="showFrame(frames.length - 1)"
            />
          </div>
          <p class="positions">
            <span>{{ t(`${g}.sheep.gold`) }} {{ coord(snapshot.nextState.gold) }}</span>
            <span>{{ t(`${g}.sheep.black`) }} {{ coord(snapshot.nextState.black) }}</span>
          </p>
          <div v-if="platformOptions.length || portalOptions.length" class="controls">
            <span v-for="(option, i) in platformOptions" :key="option.label" class="state">
              {{
                t(`${g}.groupState`, {
                  group: option.label,
                  state: t(`${g}.states.${frameStatus.platforms[i] ? 'on' : 'off'}`),
                })
              }}
            </span>
            <span v-for="(option, i) in portalOptions" :key="option.label" class="state">
              {{
                t(`${g}.groupState`, {
                  group: option.label,
                  state: t(`${g}.states.${frameStatus.portals.has(i) ? 'open' : 'closed'}`),
                })
              }}
            </span>
          </div>
          <details v-if="snapshot.events.length">
            <summary>{{ t(`${g}.stepEvents`) }}</summary>
            <ol>
              <li v-for="(event, index) in snapshot.events" :key="index">{{ eventText(event) }}</li>
            </ol>
          </details>
        </section>
      </section>
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
.board-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.page-header {
  margin-block-end: 18px;
}
h1 {
  color: var(--color-ink);
  font-size: clamp(1.45rem, 4vw, 2rem);
  font-weight: 700;
}
h2 {
  color: var(--color-ink);
  font-size: 1rem;
  font-weight: 650;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(240px, 285px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.panel {
  min-inline-size: 0;
  padding: 14px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: var(--color-surface);
}
.settings,
.group-form,
.checks,
.numeric-fields,
.replay {
  display: grid;
  gap: 8px;
}
.settings label,
.viewport label,
summary {
  font-size: 0.875rem;
}
.checks label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.group-form,
.viewport,
.replay {
  border-block-start: 1px solid var(--color-line);
  padding-block-start: 10px;
}
.controls,
.positions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.positions {
  gap: 16px;
}
.hint,
.notice li,
.replay details {
  color: var(--color-muted);
  font-size: 0.875rem;
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
.grid-panel {
  display: grid;
  gap: 12px;
}
.viewport-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(105px, 1fr));
  gap: 12px;
  margin-block-start: 8px;
  align-items: end;
}
.zoom {
  padding-inline: 6px;
  padding-block-end: 9px;
}
.zoom > :deep([data-pc-name='slider']) {
  margin-block-start: 12px;
}
.numeric-fields {
  margin-block-start: 8px;
}
.result {
  display: grid;
  gap: 8px;
}
.result:empty {
  display: none;
}
.sequence {
  overflow-wrap: anywhere;
  max-block-size: 8rem;
  overflow: auto;
  font-size: 1.15rem;
}
.state {
  padding: 2px 6px;
  border: 1px solid var(--color-line);
  border-radius: 4px;
  font-size: 0.8rem;
}
details ol {
  padding-inline-start: 1.4rem;
  list-style: decimal;
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
