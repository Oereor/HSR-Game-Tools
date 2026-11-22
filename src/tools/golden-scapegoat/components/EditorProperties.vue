<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import type { Brush, PlatformTool, PortalTool } from '../editor'
import type { Cell, PortalPair } from '../engine/map'
import { groupDetail, type GroupChoice } from '../presentation'

const props = defineProps<{
  brush: Brush
  group?: GroupChoice
  portal?: PortalPair
  platformPolarity: 'platformPressed' | 'platformReleased'
  anchor: Cell | null
}>()
const emit = defineEmits<{
  tool: [tool: PlatformTool | PortalTool]
  portalOpen: [open: boolean]
  cancelLadder: []
}>()
const { t } = useI18n()
const g = 'goldenScapegoat'
const polarityOptions = computed(() => [
  { value: 'platformPressed', label: t(`${g}.palette.activeWhenPressed`) },
  { value: 'platformReleased', label: t(`${g}.palette.activeWhenReleased`) },
])
const equalSegments = {
  pcToggleButton: {
    root: { style: { flex: '1 1 0', minInlineSize: '0', whiteSpace: 'normal' } },
  },
}
const groupMode = computed(() =>
  props.brush.tool === 'platformSwitch' || props.brush.tool === 'portalSwitch' ? 'switch' : 'place',
)
const groupModes = computed(() => [
  {
    value: 'place',
    label: t(`${g}.tools.${props.group?.kind === 'platform' ? 'placePlatform' : 'portal'}`),
  },
  { value: 'switch', label: t(`${g}.tools.placeController`) },
])

function changeGroupMode(mode: unknown) {
  if (!props.group || (mode !== 'place' && mode !== 'switch')) return
  if (props.group.kind === 'platform') {
    emit('tool', mode === 'place' ? props.platformPolarity : 'platformSwitch')
  } else {
    emit('tool', mode === 'place' ? 'portal' : 'portalSwitch')
  }
}

function changePolarity(tool: unknown) {
  if (tool === 'platformPressed' || tool === 'platformReleased') emit('tool', tool)
}
</script>

<template>
  <div v-if="brush.tool === 'ladder'" class="ladder-help">
    <p class="hint" aria-live="polite">
      {{
        anchor
          ? t(`${g}.ladderSecond`, { at: t(`${g}.coordinate`, { ...anchor }) })
          : t(`${g}.ladderFirst`)
      }}
    </p>
    <Button
      v-if="anchor"
      :label="t(`${g}.cancel`)"
      severity="secondary"
      text
      size="small"
      @click="emit('cancelLadder')"
    />
  </div>
  <section
    v-else-if="group"
    class="context"
    :style="{ '--group-color': group.color }"
    aria-labelledby="goat-group-settings"
  >
    <header class="group-heading">
      <h2 id="goat-group-settings" class="group-title">
        {{ groupDetail(group, t) }}
      </h2>
      <span
        v-if="portal"
        class="hint endpoint-count"
        role="status"
        :aria-label="t(`${g}.ends`, { count: portal.ends.length })"
      >
        {{ portal.ends.length }} / 2
      </span>
    </header>
    <div class="property-field">
      <span id="goat-draw-content" class="property-label">{{ t(`${g}.palette.brushes`) }}</span>
      <SelectButton
        :model-value="groupMode"
        :options="groupModes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="goat-draw-content"
        size="small"
        fluid
        :pt="equalSegments"
        @update:model-value="changeGroupMode"
      />
    </div>
    <div v-if="group.kind === 'platform' && groupMode === 'place'" class="property-field">
      <span id="goat-platform-activation" class="property-label">{{
        t(`${g}.palette.polarity`)
      }}</span>
      <SelectButton
        :model-value="platformPolarity"
        :options="polarityOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="goat-platform-activation"
        size="small"
        fluid
        :pt="equalSegments"
        @update:model-value="changePolarity"
      />
    </div>
    <div v-else-if="portal" class="portal-settings">
      <label class="property-label" for="goat-initially-open">{{ t(`${g}.initiallyOpen`) }}</label>
      <ToggleSwitch
        input-id="goat-initially-open"
        :model-value="portal.initiallyOpen"
        @update:model-value="emit('portalOpen', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.context {
  display: grid;
  gap: 12px;
}
.property-field {
  display: grid;
  gap: 4px;
}
.property-label {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
.group-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.group-title::before {
  content: '';
  flex: 0 0 8px;
  block-size: 8px;
  border-radius: 2px;
  background: var(--group-color);
}
.ladder-help,
.group-heading,
.portal-settings {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}
.ladder-help {
  flex-wrap: wrap;
}
.portal-settings,
.group-heading {
  justify-content: space-between;
}
.endpoint-count {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.hint {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
</style>
