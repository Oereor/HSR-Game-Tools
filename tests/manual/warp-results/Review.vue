<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import type { ToolLocale } from '../../../src/locales/types'
import type { HistoryEntry } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { warpVisualDefinitions } from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import WarpResults from '../../../src/tools/warp-simulator/components/WarpResults.vue'
import WarpItemDetails from '../../../src/tools/warp-simulator/components/WarpItemDetails.vue'
import WarpHistory from '../../../src/tools/warp-simulator/components/WarpHistory.vue'
import WarpRevealOverlay from '../../../src/tools/warp-simulator/components/WarpRevealOverlay.vue'
import { useWarpReveal } from '../../../src/tools/warp-simulator/composables/useWarpReveal'
import { useWarpReducedMotion } from '../../../src/tools/warp-simulator/composables/useWarpReducedMotion'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
} from '../../fixtures/warp-simulator/result-display'

defineOptions({ name: 'WarpResultReview' })
const { t, locale } = useI18n()
const scenarios = resultDisplayScenarios()
const scenarioId = ref(scenarios[0]!.id)
const scenario = computed(() => scenarios.find((entry) => entry.id === scenarioId.value)!)
const options = computed(() =>
  scenarios.map(({ id }) => ({ id, label: t(`review.scenarios.${id}`) })),
)
const adapter = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  import.meta.env.BASE_URL,
  warpVisualDefinitions,
)
const presentation = computed(() => ({
  ...adapter,
  item: (id: string, language: ToolLocale) => ({
    ...adapter.item(id, language),
    ...scenario.value.overrides[id],
  }),
}))
const details = shallowRef<HistoryEntry>()
let returnId: string | undefined
const replay = ref(0)
const simulateReduced = ref(false)
const systemReduced = useWarpReducedMotion()
const reveal = useWarpReveal(computed(() => simulateReduced.value || systemReduced.value))
const {
  visible: revealVisible,
  locked: revealLocked,
  current: revealEntry,
  phase: revealPhase,
  artworkReady,
  identityReady,
  displayedEntries,
} = reveal
const played = ref(false)
const reviewResults = computed(() =>
  played.value ? displayedEntries.value : scenario.value.entries,
)
let reviewBatch = 0
function playReveal() {
  const batchId = ++reviewBatch
  played.value = true
  reveal.beginBatch(
    batchId,
    scenario.value.entries.map((entry) => ({ ...entry, batchId })),
  )
}
function afterRevealHide() {
  if (reveal.afterHide()) void nextTick(() => document.getElementById('review-play')?.focus())
}
function openDetails(entry: HistoryEntry, source = 'result') {
  returnId = `warp-${source}-${entry.id}`
  details.value = entry
}
function restoreFocus() {
  if (returnId !== undefined) void nextTick(() => document.getElementById(returnId!)?.focus())
}
watch(scenarioId, () => {
  details.value = undefined
  played.value = false
  reveal.reset()
})
watchEffect(() => {
  document.documentElement.lang = locale.value
  document.title = t('review.title')
})
</script>

<template>
  <main class="app-shell" :inert="revealLocked">
    <header class="review-header">
      <h1>{{ t('review.title') }}</h1>
      <div class="language-control" :aria-label="t('site.language')">
        <button type="button" :aria-pressed="locale === 'zh-CN'" @click="locale = 'zh-CN'">
          {{ t('site.languageChinese') }}
        </button>
        <button type="button" :aria-pressed="locale === 'en'" @click="locale = 'en'">
          {{ t('site.languageEnglish') }}
        </button>
      </div>
      <p>{{ t('review.notice') }}</p>
      <label for="review-scenario">{{ t('review.scenario') }}</label>
      <Select
        class="review-scenario"
        input-id="review-scenario"
        v-model="scenarioId"
        :options="options"
        option-label="label"
        option-value="id"
      />
      <Button :label="t('review.replay')" severity="secondary" outlined @click="replay++" />
      <Button id="review-play" :label="t('review.play')" @click="playReveal" />
      <label class="review-motion"
        ><Checkbox v-model="simulateReduced" binary />{{ t('review.reducedMotion') }}</label
      >
    </header>
    <WarpResults
      :key="`${scenario.id}:${replay}`"
      :entries="reviewResults"
      :presentation="presentation"
      :source-label="t('review.scenarios.' + scenario.id)"
      @details="openDetails"
    />
    <details class="review-order">
      <summary>{{ t('review.order') }}</summary>
      <ol>
        <li v-for="entry in scenario.entries" :key="entry.id">
          #{{ entry.id }} → {{ entry.event.itemId }}
        </li>
      </ol>
    </details>
    <WarpHistory
      :entries="[...scenario.entries].reverse()"
      :total="scenario.entries.length"
      :page="0"
      :presentation="presentation"
      @details="openDetails($event, 'history')"
    />
    <WarpRevealOverlay
      :visible="revealVisible"
      :entry="revealEntry"
      :item="
        revealEntry ? presentation.item(revealEntry.event.itemId, locale as ToolLocale) : undefined
      "
      :phase="revealPhase"
      :artwork-ready="artworkReady"
      :identity-ready="identityReady"
      @artwork-ready="reveal.markArtworkReady"
      @identity-ready="reveal.markIdentityReady"
      @activate="reveal.activate"
      @escape="reveal.escape"
      @after-hide="afterRevealHide"
    />
    <WarpItemDetails
      :entry="details"
      :item="details ? presentation.item(details.event.itemId, locale as ToolLocale) : undefined"
      :source-label="t('review.notice')"
      @close="details = undefined"
      @after-hide="restoreFocus"
    />
  </main>
</template>

<style scoped>
.review-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding-block: 20px;
}
.review-header h1,
.review-header p {
  flex-basis: 100%;
}
.review-header p,
.review-order {
  color: var(--color-muted);
  font-size: 13px;
}
.review-scenario {
  max-width: 100%;
  min-width: 0;
}
.review-motion {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.review-order {
  overflow-wrap: anywhere;
  padding: 16px;
}
</style>
