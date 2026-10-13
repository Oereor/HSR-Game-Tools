<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import { SlidersHorizontal, ListOrdered } from '@lucide/vue'
import BattleSetup from '../tools/action-planner/components/BattleSetup.vue'
import ActionNavigator from '../tools/action-planner/components/ActionNavigator.vue'
import ActionInspector from '../tools/action-planner/components/ActionInspector.vue'
import { samplePlan, anchorKey, initialOperations } from '../tools/action-planner/prototype/sample'
import { usePlannerPrototype } from '../tools/action-planner/prototype/state'
import { useActionPlanner } from '../tools/action-planner/composables/useActionPlanner'
const { t } = useI18n()
const { result } = useActionPlanner(samplePlan)
const { selected, committed, draft, errors, operations, select, edit, cancel, submit, remove } =
  usePlannerPrototype(
    result.value.records.map((r) => anchorKey(r.anchor)),
    initialOperations,
  )
const record = computed(() =>
  result.value.records.find((r) => anchorKey(r.anchor) === selected.value)!,
)
const stage = ref('planning')
watch(stage, cancel)
const media = window.matchMedia('(min-width: 960px)')
const desktop = ref(media.matches)
const workspace = ref<HTMLElement>()
const width = ref(1000)
const minNavigator = computed(() => ((320 + 6) / (width.value - 2)) * 100)
const navigatorSize = computed(() => Math.max(35, minNavigator.value))
const minInspector = computed(() => ((440 + 6) / (width.value - 2)) * 100)
const syncMedia = () => {
  desktop.value = media.matches
}
const observer = new ResizeObserver((entries) => {
  width.value = entries[0]?.contentRect.width || 1000
})
onMounted(() => {
  media.addEventListener('change', syncMedia)
  if (workspace.value) observer.observe(workspace.value)
})
onBeforeUnmount(() => {
  media.removeEventListener('change', syncMedia)
  observer.disconnect()
})
</script>
<template>
  <div class="planner-page">
    <div class="page-intro">
      <div>
        <p class="eyebrow">{{ t('spike.prototype') }}</p>
        <h1>{{ t('spike.title') }}</h1>
        <p class="muted">{{ t('spike.subtitle') }}</p>
      </div>
      <span class="phase-stamp">PHASE 1B–0</span>
    </div>
    <Tabs v-model:value="stage"
      ><TabList :aria-label="t('spike.step')"
        ><Tab value="setup" class="inline-flex items-center gap-2"
          ><SlidersHorizontal :size="18" :stroke-width="1.75" /><span>{{
            t('spike.setup')
          }}</span></Tab
        ><Tab value="planning" class="inline-flex items-center gap-2"
          ><ListOrdered :size="18" :stroke-width="1.75" /><span>{{
            t('spike.planning')
          }}</span></Tab
        ></TabList
      ><TabPanels
        ><TabPanel value="setup"><BattleSetup @continue="stage = 'planning'" /></TabPanel
        ><TabPanel value="planning">
          <div class="timeline-context">
            <span class="context-label">{{ t('spike.fixed') }}</span>
            <p>{{ t('spike.fixedNote') }}</p>
          </div>
          <div ref="workspace" class="workspace" :class="{ 'workspace-mobile': !desktop }">
            <Splitter
              v-if="desktop"
              :gutter-size="6"
              :pt="{
                gutterHandle: {
                  'aria-label': t('spike.resize'),
                  'aria-orientation': 'vertical',
                  'aria-valuemin': minNavigator,
                  'aria-valuemax': 100 - minInspector,
                },
              }"
              class="planner-splitter"
              ><SplitterPanel :size="navigatorSize" :min-size="minNavigator"
                ><ActionNavigator
                  :records="result.records"
                  :selected="selected"
                  :operations="committed"
                  @select="select" /></SplitterPanel
              ><SplitterPanel :size="100 - navigatorSize" :min-size="minInspector"
                ><ActionInspector
                  v-model:draft="draft"
                  :record="record"
                  :operations="operations"
                  :errors="errors"
                  @edit="edit"
                  @remove="remove"
                  @cancel="cancel"
                  @submit="submit" /></SplitterPanel
            ></Splitter>
            <template v-else
              ><ActionNavigator
                :records="result.records"
                :selected="selected"
                :operations="committed"
                @select="select" /><ActionInspector
                v-model:draft="draft"
                :record="record"
                :operations="operations"
                :errors="errors"
                @edit="edit"
                @remove="remove"
                @cancel="cancel"
                @submit="submit"
            /></template>
          </div> </TabPanel></TabPanels
    ></Tabs>
    <p class="prototype-boundary">{{ t('spike.boundary') }}</p>
  </div>
</template>
