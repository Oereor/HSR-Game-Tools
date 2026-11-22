<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eraser, Flag, Layers2, RectangleHorizontal, Signpost } from '@lucide/vue'
import Button from 'primevue/button'
import RadioButton from 'primevue/radiobutton'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import {
  basicTools,
  type BasicTool,
  type Brush,
  type PlatformTool,
  type PortalTool,
} from '../editor'
import type { Cell, PortalPair } from '../engine/map'
import { groupDetail, groupName, type GroupChoice } from '../presentation'

const props = defineProps<{
  brush: Brush
  group?: GroupChoice
  slots: GroupChoice[]
  extras: GroupChoice[]
  portal?: PortalPair
  platformPolarity: 'platformPressed' | 'platformReleased'
  anchor: Cell | null
}>()
const emit = defineEmits<{
  basic: [tool: BasicTool]
  group: [choice: GroupChoice]
  tool: [tool: PlatformTool | PortalTool]
  portalOpen: [open: boolean]
  cancelLadder: []
}>()
const { t } = useI18n()
const g = 'goldenScapegoat'
const extraOptions = computed(() =>
  props.extras.map((choice) => ({ choice, label: groupDetail(choice, t) })),
)
const activeExtra = computed(() => extraOptions.value.find(({ choice }) => choice === props.group))
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
const icons = {
  floor: RectangleHorizontal,
  ladder: Layers2,
  start: Signpost,
  goal: Flag,
  erase: Eraser,
}
</script>

<template>
  <div class="palette">
    <div class="tool-buttons" role="group" :aria-label="t(`${g}.palette.basic`)">
      <Button
        v-for="tool in basicTools"
        :key="tool"
        :label="t(`${g}.tools.${tool}`)"
        size="small"
        :severity="brush.tool === tool ? 'primary' : 'secondary'"
        :aria-pressed="brush.tool === tool"
        @click="emit('basic', tool)"
      >
        <template #icon><component :is="icons[tool]" :size="15" aria-hidden="true" /></template>
      </Button>
    </div>
    <div class="group-buttons" role="group" :aria-label="t(`${g}.palette.groups`)">
      <Button
        v-for="choice in slots"
        :key="`${choice.kind}:${choice.id}`"
        :label="groupName(choice, t)"
        :aria-label="groupDetail(choice, t)"
        size="small"
        :severity="group === choice ? 'primary' : 'secondary'"
        :outlined="group === choice"
        :aria-pressed="group === choice"
        @click="emit('group', choice)"
      >
        <template #icon>
          <span
            :class="choice.kind"
            :style="{ '--group-color': choice.color }"
            aria-hidden="true"
          />
        </template>
      </Button>
    </div>
    <Select
      v-if="extras.length"
      :model-value="activeExtra"
      :options="extraOptions"
      option-label="label"
      :aria-label="t(`${g}.palette.extras`)"
      :placeholder="t(`${g}.palette.extras`)"
      size="small"
      fluid
      @update:model-value="emit('group', $event.choice)"
    />

    <p v-if="brush.tool === 'ladder'" class="hint" aria-live="polite">
      {{
        anchor
          ? t(`${g}.ladderSecond`, { at: t(`${g}.coordinate`, { ...anchor }) })
          : t(`${g}.ladderFirst`)
      }}
      <Button
        v-if="anchor"
        :label="t(`${g}.cancel`)"
        text
        size="small"
        @click="emit('cancelLadder')"
      />
    </p>
    <p v-else-if="brush.tool === 'erase'" class="hint">{{ t(`${g}.palette.eraseHint`) }}</p>
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
        <p class="hint">{{ t(`${g}.palette.polarityHint`) }}</p>
      </fieldset>
      <div v-else-if="portal" class="portal-settings">
        <label class="initial-state" for="goat-initially-open">
          <ToggleSwitch
            input-id="goat-initially-open"
            :model-value="portal.initiallyOpen"
            @update:model-value="emit('portalOpen', $event)"
          />
          {{ t(`${g}.initiallyOpen`) }}
        </label>
        <span
          class="hint"
          :aria-label="t(`${g}.ends`, { count: portal.ends.length })"
          role="status"
        >
          {{ portal.ends.length }} / 2
        </span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.palette,
.context {
  display: grid;
  gap: 8px;
}
.tool-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.group-buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.group-buttons > button {
  justify-content: flex-start;
  text-align: start;
}
.platform,
.portal {
  flex: 0 0 12px;
  border: 1px solid var(--group-color);
}
.platform {
  height: 5px;
  border-radius: 2px;
  background: var(--group-color);
}
.portal {
  height: 13px;
  border-radius: 5px 5px 2px 2px;
}
.context {
  border-inline-start: 2px solid var(--group-color, var(--color-line));
  padding-inline-start: 9px;
}
.group-title {
  font-size: 0.875rem;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.polarities {
  display: grid;
  gap: 6px;
}
.initial-state,
.polarities label,
.portal-settings {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}
.portal-settings {
  justify-content: space-between;
}
.hint {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
</style>
