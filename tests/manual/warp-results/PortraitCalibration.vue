<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import {
  portraitFocus,
  portraitFocusOverrides,
} from '../../../src/tools/warp-simulator/model/portrait-focus'
import WarpResultCard from '../../../src/tools/warp-simulator/components/WarpResultCard.vue'
import { resultDisplayScenarios } from '../../fixtures/warp-simulator/result-display'
import type { ToolLocale } from '../../../src/locales/types'
const { t, locale } = useI18n()
const adapter = createPresentation(
  warpSnapshot,
  warpVisuals,
  import.meta.env.BASE_URL,
  warpVisualDefinitions,
)
const selected = ref('avatar:1415')
const focus = ref({ ...portraitFocus(selected.value) })
const saved = ref<Record<string, { x: number; y: number; scale: number }>>({
  ...portraitFocusOverrides,
})
const options = computed(() =>
  warpSnapshot.items
    .filter((i) => i.kind === 'avatar')
    .map((i) => ({ id: i.id, name: i.names[locale.value as ToolLocale] })),
)
const item = computed(() => adapter.item(selected.value, locale.value as ToolLocale))
const entry = computed(() => {
  const base = resultDisplayScenarios().find((s) => s.id === 'single-avatar-4')!.entries[0]!
  return {
    ...base,
    event: { ...base.event, itemId: selected.value, rarity: item.value.rarity!, isUp: null },
  }
})
watch(selected, (id) => {
  focus.value = { ...(saved.value[id] ?? portraitFocus(id)) }
})
watch(
  focus,
  (value) => {
    saved.value = { ...saved.value, [selected.value]: { ...value } }
  },
  { deep: true },
)
function pick(event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  focus.value = {
    ...focus.value,
    x: Number(((event.clientX - box.left) / box.width).toFixed(4)),
    y: Number(((event.clientY - box.top) / box.height).toFixed(4)),
  }
}
function exportJson() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(saved.value, null, 2) + '\n'], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'portrait-focus.json'
  link.click()
  URL.revokeObjectURL(url)
}
function updateFocus(field: 'x' | 'y' | 'scale', value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  focus.value = {
    ...focus.value,
    [field]: Math.min(field === 'scale' ? 8 : 1, Math.max(field === 'scale' ? 0.1 : 0, value)),
  }
}
</script>
<template>
  <details class="portrait-calibration">
    <summary>{{ t('review.calibration.title') }}</summary>
    <p>{{ t('review.calibration.hint') }}</p>
    <div class="calibration-controls">
      <Select
        v-model="selected"
        :options="options"
        option-label="name"
        option-value="id"
        :aria-label="t('review.calibration.character')"
      />
      <label v-for="field in ['x', 'y', 'scale'] as const" :key="field" :for="`focus-${field}`"
        >{{ field }}
        <InputNumber
          :model-value="focus[field]"
          @update:model-value="(value) => updateFocus(field, value)"
          :input-id="`focus-${field}`"
          :min="field === 'scale' ? 0.1 : 0"
          :max="field === 'scale' ? 8 : 1"
          :step="field === 'scale' ? 0.1 : 0.005"
          :min-fraction-digits="3"
          :max-fraction-digits="4"
          show-buttons
        />
      </label>
      <Button :label="t('review.calibration.export')" @click="exportJson" />
    </div>
    <div class="calibration-preview">
      <div
        class="calibration-source"
        :style="{
          aspectRatio: `${item.revealArtwork?.width ?? 1} / ${item.revealArtwork?.height ?? 1}`,
        }"
        @click="pick"
      >
        <img :src="item.revealArtwork?.url ?? item.artworkUrl" :alt="item.name" />
        <span
          class="calibration-anchor"
          :style="{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }"
        />
      </div>
      <div class="calibration-card">
        <WarpResultCard
          :entry="entry"
          :item="item"
          :index="0"
          :single="false"
          :focus="focus"
          id-prefix="calibration-result"
        />
        <pre>{{ JSON.stringify({ [selected]: focus }, null, 2) }}</pre>
      </div>
    </div>
  </details>
</template>
<style scoped>
.portrait-calibration {
  margin-block: 24px;
  border: 1px solid var(--color-line);
  padding: 20px;
}
summary {
  cursor: pointer;
  font-size: 18px;
}
.calibration-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: end;
  margin-block: 20px;
}
label {
  display: grid;
  gap: 6px;
}
.calibration-controls :deep(input) {
  width: 90px;
}
.calibration-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 32px;
  align-items: center;
}
.calibration-source {
  position: relative;
  width: 100%;
  background: #242a36;
  cursor: crosshair;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.calibration-anchor {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #000;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.calibration-card {
  min-width: 0;
}
pre {
  white-space: pre-wrap;
  font-size: 13px;
}
@media (max-width: 640px) {
  .calibration-preview {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
