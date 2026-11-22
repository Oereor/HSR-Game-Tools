<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eraser, Flag, Layers2, RectangleHorizontal, Signpost } from '@lucide/vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Toolbar from 'primevue/toolbar'
import type { BasicTool, Brush } from '../editor'
import { groupDetail, groupName, type GroupChoice } from '../presentation'

const props = defineProps<{
  brush: Brush
  group?: GroupChoice
  slots: GroupChoice[]
  extras: GroupChoice[]
}>()
const emit = defineEmits<{ basic: [tool: BasicTool]; group: [choice: GroupChoice] }>()
const { t } = useI18n()
const g = 'goldenScapegoat'
const extraOptions = computed(() =>
  props.extras.map((choice) => ({ choice, label: groupDetail(choice, t) })),
)
const activeExtra = computed(() => extraOptions.value.find(({ choice }) => choice === props.group))
const sections = [
  { label: 'markers', tools: ['start', 'goal'] },
  { label: 'terrain', tools: ['floor', 'ladder'] },
  { label: 'groups', tools: [] },
  { label: 'edits', tools: ['erase'] },
] as const
const icons = {
  floor: RectangleHorizontal,
  ladder: Layers2,
  start: Signpost,
  goal: Flag,
  erase: Eraser,
}
</script>

<template>
  <div class="toolbar-scroll">
    <Toolbar class="tool-strip" :aria-label="t(`${g}.palette.toolbar`)">
      <template #start>
        <div class="tool-row">
          <div
            v-for="section in sections"
            :key="section.label"
            class="tool-group"
            role="group"
            :aria-label="t(`${g}.palette.${section.label}`)"
          >
            <template v-if="section.label === 'groups'">
              <Button
                v-for="choice in slots"
                :key="`${choice.kind}:${choice.id}`"
                :label="groupName(choice, t)"
                :aria-label="groupDetail(choice, t)"
                :title="groupDetail(choice, t)"
                size="small"
                severity="secondary"
                :text="group !== choice"
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
              <Select
                v-if="extras.length"
                :model-value="activeExtra"
                :options="extraOptions"
                option-label="label"
                :aria-label="t(`${g}.palette.extras`)"
                :placeholder="t(`${g}.palette.extras`)"
                size="small"
                @update:model-value="emit('group', $event.choice)"
              />
            </template>
            <Button
              v-for="tool in section.tools"
              :key="tool"
              :label="t(`${g}.tools.${tool}`)"
              size="small"
              :severity="brush.tool === tool ? 'primary' : 'secondary'"
              :text="brush.tool !== tool"
              :aria-pressed="brush.tool === tool"
              @click="emit('basic', tool)"
            >
              <template #icon
                ><component :is="icons[tool]" :size="16" aria-hidden="true"
              /></template>
            </Button>
          </div>
        </div>
      </template>
    </Toolbar>
  </div>
</template>

<style scoped>
.toolbar-scroll {
  min-inline-size: 0;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  border: 1px solid var(--color-line);
  border-radius: 8px;
}
.tool-strip {
  inline-size: max-content;
  min-inline-size: 100%;
  padding: 5px 6px;
  border: 0;
  border-radius: 0;
  background: var(--color-surface);
}
.tool-row,
.tool-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tool-row {
  gap: 8px;
}
.tool-group + .tool-group {
  border-inline-start: 1px solid var(--color-line);
  padding-inline-start: 8px;
}
.platform,
.portal {
  flex: 0 0 12px;
  border: 1px solid var(--group-color);
}
.platform {
  block-size: 6px;
  border-radius: 2px;
  background: var(--group-color);
}
.portal {
  block-size: 13px;
  border-radius: 5px 5px 2px 2px;
}
</style>
