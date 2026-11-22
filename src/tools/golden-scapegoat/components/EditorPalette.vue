<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eraser, Flag, Layers2, RectangleHorizontal, Signpost } from '@lucide/vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import {
  basicTools,
  platformTools,
  portalTools,
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

    <p v-if="brush.tool === 'ladder'" class="context hint" aria-live="polite">
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
    <p v-else-if="brush.tool === 'erase'" class="context hint">{{ t(`${g}.palette.eraseHint`) }}</p>
    <div v-else-if="group" class="context" :style="{ '--group-color': group.color }">
      <strong class="group-title">{{ groupDetail(group, t) }}</strong>
      <div class="tool-buttons" role="group" :aria-label="t(`${g}.palette.brushes`)">
        <Button
          v-for="tool in group.kind === 'platform' ? platformTools : portalTools"
          :key="tool"
          :label="t(`${g}.tools.${tool}`)"
          size="small"
          :severity="brush.tool === tool ? 'primary' : 'secondary'"
          :aria-pressed="brush.tool === tool"
          @click="emit('tool', tool)"
        />
      </div>
      <p v-if="group.kind === 'platform'" class="hint">{{ t(`${g}.palette.polarityHint`) }}</p>
      <template v-else-if="portal">
        <label class="initial-state" for="goat-initially-open">
          <Checkbox
            input-id="goat-initially-open"
            binary
            :model-value="portal.initiallyOpen"
            @update:model-value="emit('portalOpen', $event)"
          />
          {{ t(`${g}.initiallyOpen`) }}
        </label>
        <p class="hint">{{ t(`${g}.ends`, { count: portal.ends.length }) }}</p>
      </template>
    </div>
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
  overflow-wrap: anywhere;
}
.initial-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}
.hint {
  color: var(--color-muted);
  font-size: 0.8125rem;
}
</style>
