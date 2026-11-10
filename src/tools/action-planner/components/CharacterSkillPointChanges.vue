<script setup lang="ts">
import { Info } from '@lucide/vue'
import type { formatCharacterSkillPointChanges } from '../model/presentation'

defineProps<{
  changes?: ReturnType<typeof formatCharacterSkillPointChanges>
  tone?: string
}>()
</script>

<template>
  <template v-if="changes">
    <span v-if="changes.resource" :class="changes.delta ? 'fine-print' : tone">
      {{ changes.resource }}
    </span>
    <span v-if="changes.delta" :class="tone">{{ changes.delta }}</span>
    <span v-if="changes.balance" class="fine-print">{{ changes.balance }}</span>
    <span
      v-if="changes.tooltip"
      v-tooltip.focus="changes.tooltip"
      class="change-help"
      role="img"
      :aria-label="changes.tooltip"
      tabindex="0"
    >
      <span v-tooltip="changes.tooltip" class="change-help" aria-hidden="true">
        <Info :size="14" :stroke-width="1.75" />
      </span>
    </span>
  </template>
</template>

<style scoped>
.change-help {
  display: inline-flex;
  color: var(--color-muted);
  cursor: help;
}
</style>
