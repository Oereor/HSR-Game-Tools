<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'

const { t } = useI18n()
const workspace = ref<HTMLElement>()
const workspaceWidth = ref(0)
const preferred = ref(75)
const gutterSize = 6
const desktop = computed(() => workspaceWidth.value >= 860)

// The Splitter subtracts the gutter from each inline flex basis.
const minMap = computed(() => (100 * (480 + gutterSize)) / workspaceWidth.value)
const minInspector = computed(() => (100 * (300 + gutterSize)) / workspaceWidth.value)
const mapSize = computed(() =>
  Math.min(100 - minInspector.value, Math.max(minMap.value, preferred.value)),
)

let observer: ResizeObserver | undefined
let resizeFrame: number | undefined
onMounted(() => {
  const element = workspace.value!
  observer = new ResizeObserver(([entry]) => {
    const { width } = entry.contentRect
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
    resizeFrame = undefined
    if (width <= 0 || width === workspaceWidth.value) return
    // Switching layouts changes the nested board's size. Update after observer delivery.
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined
      workspaceWidth.value = width
    })
  })
  observer.observe(element)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
})
</script>

<template>
  <div ref="workspace" class="editor-workspace">
    <Splitter
      v-if="desktop"
      class="editor-splitter"
      :gutter-size="gutterSize"
      :pt="{
        gutterHandle: {
          'aria-label': t('ui.resize'),
          'aria-orientation': 'vertical',
          'aria-valuemin': Math.ceil(minMap),
          'aria-valuemax': Math.floor(100 - minInspector),
        },
      }"
      @resizeend="preferred = $event.sizes[0]"
    >
      <SplitterPanel class="workspace-pane" :size="mapSize" :min-size="minMap">
        <slot name="map" />
      </SplitterPanel>
      <SplitterPanel class="workspace-pane" :size="100 - mapSize" :min-size="minInspector">
        <slot name="inspector" />
      </SplitterPanel>
    </Splitter>
    <div v-else class="editor-stack">
      <slot name="map" />
      <slot name="inspector" />
    </div>
  </div>
</template>

<style scoped>
.editor-workspace,
.workspace-pane {
  min-inline-size: 0;
}
.editor-splitter {
  block-size: clamp(420px, 67dvh, 780px);
  border: 1px solid var(--color-line);
  border-radius: 8px;
  overflow: hidden;
}
.workspace-pane {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-block-size: 0;
  overflow: hidden;
}
.editor-stack {
  display: grid;
  gap: 10px;
}
</style>
