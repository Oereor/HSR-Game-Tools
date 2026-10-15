<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import { Check, Search } from '@lucide/vue'
import type { ToolLocale } from '../../../locales/types'
import type { createPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'
const props = defineProps<{
  visible: boolean
  draft: readonly string[]
  eligibleIds: readonly string[]
  valid: boolean
  presentation: ReturnType<typeof createPresentation>
}>()
const emit = defineEmits<{ cancel: []; confirm: []; 'update:draft': [ids: string[]] }>()
const { t, locale } = useI18n()
const query = ref('')
watch(
  () => props.visible,
  (visible) => {
    if (visible) query.value = ''
  },
)
const candidates = computed(() =>
  props.presentation
    .search(props.eligibleIds, query.value)
    .map((id) => props.presentation.item(id, locale.value as ToolLocale)),
)
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :draggable="false"
    :header="t('warp.selection.title')"
    :style="{ width: '42rem', maxWidth: 'calc(100vw - 32px)' }"
    :close-button-props="{ 'aria-label': t('warp.cancel') }"
    @update:visible="
      (value) => {
        if (!value) emit('cancel')
      }
    "
  >
    <div class="warp-selection">
      <label for="warp-character-search" class="warp-search-label"
        ><Search :size="16" aria-hidden="true" />{{ t('warp.selection.search') }}</label
      >
      <InputText
        id="warp-character-search"
        v-model="query"
        class="warp-search"
        :placeholder="t('warp.selection.searchPlaceholder')"
        aria-describedby="warp-selection-hint"
        autofocus
      />
      <p id="warp-selection-hint" class="warp-selection-hint">{{ t('warp.selection.hint') }}</p>
      <p id="warp-selection-count" class="warp-selection-count" aria-live="polite">
        {{ t('warp.selection.count', { count: draft.length }) }}
      </p>
      <fieldset
        class="warp-character-grid"
        aria-describedby="warp-selection-count warp-selection-error"
      >
        <legend class="warp-sr-only">{{ t('warp.selection.candidates') }}</legend>
        <label
          v-for="item in candidates"
          :key="item.id"
          :for="`warp-choice-${item.id}`"
          class="warp-character-choice"
          :class="{ selected: draft.includes(item.id) }"
        >
          <Checkbox
            :input-id="`warp-choice-${item.id}`"
            :model-value="draft"
            :value="item.id"
            :disabled="!draft.includes(item.id) && draft.length >= 7"
            :pt="{ input: { 'aria-describedby': 'warp-selection-count warp-selection-error' } }"
            @update:model-value="emit('update:draft', $event)"
          />
          <span class="warp-choice-portrait" aria-hidden="true"
            ><WarpItemVisual :item="item"
          /></span>
          <span class="warp-choice-name" :title="item.name">{{ item.name }}</span>
        </label>
      </fieldset>
      <p v-if="!candidates.length" class="warp-selection-hint">
        {{ t('warp.selection.noMatches') }}
      </p>
      <p id="warp-selection-error" class="warp-selection-hint">
        {{ !valid ? t('warp.selection.required') : t('warp.selection.ready') }}
      </p>
    </div>
    <template #footer>
      <Button :label="t('warp.cancel')" severity="secondary" outlined @click="emit('cancel')" />
      <Button :label="t('warp.selection.confirm')" :disabled="!valid" @click="emit('confirm')"
        ><template #icon><Check :size="16" aria-hidden="true" /></template
      ></Button>
    </template>
  </Dialog>
</template>

<style scoped>
.warp-selection {
  min-width: 0;
}
.warp-search-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.warp-search {
  width: 100%;
}
.warp-selection-hint {
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.6;
}
.warp-selection-count {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.warp-character-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
.warp-character-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  cursor: pointer;
}
.warp-character-choice.selected {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 7%, transparent);
}
.warp-choice-portrait {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}
.warp-choice-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.warp-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 480px) {
  .warp-character-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
