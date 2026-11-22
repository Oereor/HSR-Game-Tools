<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import RadioButton from 'primevue/radiobutton'
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
const polarityOptions = ['platformPressed', 'platformReleased'] as const
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
    <h2 id="goat-group-settings" class="group-title">{{ groupDetail(group, t) }}</h2>
    <SelectButton
      :model-value="groupMode"
      :options="groupModes"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :aria-label="t(`${g}.palette.brushes`)"
      size="small"
      @update:model-value="changeGroupMode"
    />
    <fieldset v-if="group.kind === 'platform' && groupMode === 'place'" class="polarities">
      <legend class="sr-only">{{ t(`${g}.palette.polarity`) }}</legend>
      <label v-for="tool in polarityOptions" :key="tool" :for="`goat-${tool}`">
        <RadioButton
          :input-id="`goat-${tool}`"
          name="goat-platform-polarity"
          :model-value="platformPolarity"
          :value="tool"
          size="small"
          @update:model-value="emit('tool', tool)"
        />
        {{ t(`${g}.tools.${tool}`) }}
      </label>
    </fieldset>
    <div v-else-if="portal" class="portal-settings">
      <label for="goat-initially-open">
        <ToggleSwitch
          input-id="goat-initially-open"
          :model-value="portal.initiallyOpen"
          @update:model-value="emit('portalOpen', $event)"
        />
        {{ t(`${g}.initiallyOpen`) }}
      </label>
      <span class="hint" :aria-label="t(`${g}.ends`, { count: portal.ends.length })" role="status">
        {{ portal.ends.length }} / 2
      </span>
    </div>
  </section>
</template>

<style scoped>
.context,
.polarities {
  display: grid;
  gap: 8px;
}
.context {
  border-inline-start: 2px solid var(--group-color);
  padding-inline-start: 10px;
}
.group-title {
  font-size: 0.875rem;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.ladder-help,
.context label,
.portal-settings {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}
.ladder-help {
  flex-wrap: wrap;
}
.portal-settings {
  justify-content: space-between;
}
.hint {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
</style>
