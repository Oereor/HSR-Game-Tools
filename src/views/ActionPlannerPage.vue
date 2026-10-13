<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { SlidersHorizontal, ListOrdered, RotateCcw } from '@lucide/vue'
import BattleSetup from '../tools/action-planner/components/BattleSetup.vue'
import ActionNavigator from '../tools/action-planner/components/ActionNavigator.vue'
import ActionInspector from '../tools/action-planner/components/ActionInspector.vue'
import { useActionPlanner } from '../tools/action-planner/composables/useActionPlanner'
import { usePlannerPresentation } from '../tools/action-planner/composables/usePlannerPresentation'
import type { ActorConfig } from '../engine/action-planner/types'
const { t, locale } = useI18n()
const planner = useActionPlanner()
const {
  document,
  plan,
  result,
  selected,
  stage,
  view,
  draft,
  invalid,
  operations,
  context,
  preview,
  targets,
  unreached,
  queueIndex,
  snapshot,
  select,
  edit,
  cancel,
  submit,
  remove,
  move,
  deleteEvent,
  stepQueue,
  nextId,
  operationContext,
} = planner
const { label, image, title, anchorLabel } = usePlannerPresentation(document, locale)
const resetVisible = ref(false)
function confirmReset() {
  planner.reset()
  resetVisible.value = false
}
function apply(
  actors: ActorConfig[],
  nodes: number,
  av: number,
  characters: Record<string, string>,
) {
  if (planner.applySetup(actors, nodes, av, characters)) stage.value = 'planning'
}
const navigatorProps = computed(() => ({
  records: result.value.records,
  selected: selected.value,
  plan: plan.value,
  snapshot: snapshot.value,
  queueIndex: queueIndex.value,
  snapshotCount: result.value.snapshots.length,
  label,
  image,
}))
const inspectorProps = computed(() => ({
  anchor: selected.value,
  operations: operations.value,
  context: context.value,
  preview: preview.value,
  targets: targets.value,
  invalid: invalid.value,
  label,
  image,
  anchorLabel,
  title,
  operationContext,
}))
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
    <div class="page-intro functional-intro">
      <h1>{{ t('planner.title') }}</h1>
      <Button
        v-tooltip="t('ui.reset')"
        text
        severity="secondary"
        :aria-label="t('ui.reset')"
        @click="resetVisible = true"
        ><RotateCcw :size="18" :stroke-width="1.75" /><span>{{ t('ui.reset') }}</span></Button
      >
    </div>
    <Tabs v-model:value="stage"
      ><TabList :aria-label="t('ui.stage')"
        ><Tab value="setup" class="inline-flex items-center gap-2"
          ><SlidersHorizontal :size="18" :stroke-width="1.75" /><span>{{
            t('ui.setup')
          }}</span></Tab
        ><Tab value="planning" class="inline-flex items-center gap-2"
          ><ListOrdered :size="18" :stroke-width="1.75" /><span>{{ t('ui.planning') }}</span></Tab
        ></TabList
      ><TabPanels
        ><TabPanel value="setup"
          ><BattleSetup
            :plan="plan"
            :character-ids="document.metadata.characterIds"
            :next-id="nextId"
            @apply="apply" /></TabPanel
        ><TabPanel value="planning">
          <details
            v-if="result.diagnostics.length"
            class="diagnostics"
            :open="result.stopReason === 'error'"
          >
            <summary>{{ t('ui.diagnostics', { count: result.diagnostics.length }) }}</summary>
            <ul>
              <li
                v-for="(diagnostic, index) in result.diagnostics"
                :key="index"
                :class="{ 'field-error': diagnostic.severity === 'error' }"
              >
                <button
                  v-if="diagnostic.anchor"
                  class="text-button"
                  @click="select(diagnostic.anchor)"
                >
                  {{ anchorLabel(diagnostic.anchor) }}</button
                ><span>{{ t(`ui.diagnostic.${diagnostic.code}`) }}</span>
              </li>
            </ul>
          </details>
          <div ref="workspace" class="workspace" :class="{ 'workspace-mobile': !desktop }">
            <Splitter
              v-if="desktop"
              :gutter-size="6"
              :pt="{
                gutterHandle: {
                  'aria-label': t('ui.resize'),
                  'aria-orientation': 'vertical',
                  'aria-valuemin': minNavigator,
                  'aria-valuemax': 100 - minInspector,
                },
              }"
              class="planner-splitter"
              ><SplitterPanel :size="navigatorSize" :min-size="minNavigator"
                ><ActionNavigator
                  v-model:view="view"
                  v-bind="navigatorProps"
                  @select="select"
                  @step="stepQueue" /></SplitterPanel
              ><SplitterPanel :size="100 - navigatorSize" :min-size="minInspector"
                ><ActionInspector
                  v-model:draft="draft"
                  v-bind="inspectorProps"
                  @edit="edit"
                  @remove="remove"
                  @move="move"
                  @cancel="cancel"
                  @submit="submit" /></SplitterPanel></Splitter
            ><template v-else
              ><ActionNavigator
                v-model:view="view"
                v-bind="navigatorProps"
                @select="select"
                @step="stepQueue" /><ActionInspector
                v-model:draft="draft"
                v-bind="inspectorProps"
                @edit="edit"
                @remove="remove"
                @move="move"
                @cancel="cancel"
                @submit="submit"
            /></template>
          </div>
          <section v-if="unreached.length" class="unreached-events">
            <h2>{{ t('ui.unreached') }}</h2>
            <div
              v-for="event in unreached"
              :key="JSON.stringify(event.anchor)"
              class="unreached-row"
            >
              <button class="text-button" @click="select(event.anchor)">
                {{ anchorLabel(event.anchor) }}</button
              ><Button
                text
                severity="secondary"
                size="small"
                :label="t('ui.deleteEvent')"
                @click="deleteEvent(event.anchor)"
              />
            </div>
          </section> </TabPanel></TabPanels
    ></Tabs>
    <Dialog
      v-model:visible="resetVisible"
      modal
      :header="t('ui.reset')"
      :close-button-props="{ 'aria-label': t('ui.close') }"
      :style="{ width: '420px', maxWidth: 'calc(100vw - 32px)' }"
      ><p>{{ t('ui.resetConfirm') }}</p>
      <template #footer
        ><Button
          text
          severity="secondary"
          :label="t('ui.cancel')"
          @click="resetVisible = false" /><Button
          :label="t('ui.reset')"
          @click="confirmReset" /></template
    ></Dialog>
  </div>
</template>
