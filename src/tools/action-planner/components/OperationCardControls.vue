<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from '@lucide/vue'

defineProps<{
  name: string
  first: boolean
  last: boolean
  editDisabled?: boolean
}>()
const emit = defineEmits<{ move: [delta: -1 | 1]; edit: []; remove: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="card-controls">
    <Button
      v-tooltip="t('ui.moveUp')"
      text
      size="small"
      severity="secondary"
      :disabled="first"
      :aria-label="t('ui.moveUp')"
      @click="emit('move', -1)"
      ><ArrowUp :size="15"
    /></Button>
    <Button
      v-tooltip="t('ui.moveDown')"
      text
      size="small"
      severity="secondary"
      :disabled="last"
      :aria-label="t('ui.moveDown')"
      @click="emit('move', 1)"
      ><ArrowDown :size="15"
    /></Button>
    <Button
      v-tooltip="t('ui.edit')"
      text
      size="small"
      severity="secondary"
      :disabled="editDisabled"
      :aria-label="t('planner.accessibility.edit', { name })"
      @click="emit('edit')"
      ><Pencil :size="15"
    /></Button>
    <Button
      v-tooltip="t('ui.remove')"
      text
      size="small"
      severity="secondary"
      :aria-label="t('planner.accessibility.remove', { name })"
      @click="emit('remove')"
      ><Trash2 :size="15"
    /></Button>
  </div>
</template>
