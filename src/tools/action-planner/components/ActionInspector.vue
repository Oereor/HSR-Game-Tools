<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Gauge, Timer } from '@lucide/vue'
import GameIcon from '../../../components/ui/GameIcon.vue'
import OperationEditor from './OperationEditor.vue'
import { sampleCharacters } from '../prototype/sample'
import { characterName } from '../../../data/adapters/game-data'
import { formatAV } from '../model/presentation'
import type { NodeRecord } from '../../../engine/action-planner/types'
import type { ToolLocale } from '../../../locales/types'
import type { PrototypeDraft, PrototypeOperation } from '../prototype/state'
const props = defineProps<{
  record: NodeRecord
  operations: PrototypeOperation[]
  errors: string[]
}>()
const draft = defineModel<PrototypeDraft>('draft')
const emit = defineEmits<{
  edit: [operation?: PrototypeOperation]
  remove: [id: string]
  cancel: []
  submit: []
}>()
const { t, locale } = useI18n()
const currentCharacter = computed(() => sampleCharacters.find((c) => c.id === props.record.id))
const target = (id: string) => sampleCharacters.find((c) => c.id === id)
const name = computed(() =>
  currentCharacter.value
    ? characterName(currentCharacter.value, locale.value as ToolLocale)
    : t('spike.sampleEvent'),
)
const icons = { speed: Gauge, advance: ArrowUp, delay: ArrowDown, event: Timer }
const overview = ref<HTMLElement>()
watch(
  () => !!draft.value,
  async (editing, wasEditing) => {
    if (!editing && wasEditing) {
      await nextTick()
      overview.value?.focus()
    }
  },
)
</script>
<template>
  <section class="inspector" :aria-label="t('spike.inspector')">
    <div class="pane-heading">
      <h2>{{ t('spike.inspector') }}</h2>
      <span class="quiet-tag">{{ t('spike.demoBadge') }}</span>
    </div>
    <OperationEditor
      v-if="draft"
      v-model="draft"
      :errors="errors"
      @cancel="emit('cancel')"
      @submit="emit('submit')"
    />
    <div v-else class="inspector-overview">
      <div class="current-node">
        <GameIcon
          v-if="currentCharacter"
          :asset-key="currentCharacter.assetKey"
          :name="name"
          :fallback="t('planner.imageMissing')"
        /><span v-else class="event-avatar"><Timer :size="28" :stroke-width="1.75" /></span>
        <div class="current-identity">
          <span class="overline">{{
            record.anchor.kind === 'action'
              ? t('spike.turn', { turn: record.anchor.turn })
              : t('spike.eventNode')
          }}</span>
          <h2 ref="overview" tabindex="-1">{{ name }}</h2>
          <span class="camp-ally" v-if="record.kind === 'actor'">{{ t('spike.ally') }}</span>
        </div>
        <div class="current-av">
          <span>{{ t('spike.elapsed') }}</span
          ><strong>{{ formatAV(record.elapsedAV, locale as ToolLocale) }}<small> AV</small></strong>
        </div>
      </div>
      <div class="operations-heading">
        <h3>
          {{ t('spike.operations') }} <span class="operation-count">{{ operations.length }}</span>
        </h3>
        <Button size="small" @click="emit('edit')"
          ><Plus :size="16" :stroke-width="1.75" />{{ t('spike.add') }}</Button
        >
      </div>
      <div v-if="!operations.length" class="empty-operations">
        <Plus :size="24" :stroke-width="1.75" />
        <p>{{ t('spike.empty') }}</p>
      </div>
      <div class="operation-list">
        <article
          v-for="operation in operations"
          :key="operation.id"
          class="operation-card"
          :data-operation="operation.id"
        >
          <div class="operation-top">
            <component
              :is="icons[operation.kind]"
              :size="18"
              :stroke-width="1.75"
              :class="
                operation.kind === 'advance'
                  ? 'advance-color'
                  : operation.kind === 'delay'
                    ? 'delay-color'
                    : 'muted'
              "
            /><button class="operation-title" @click="emit('edit', operation)">
              {{ t(`spike.${operation.kind}`) }}</button
            ><strong
              v-if="operation.kind !== 'event'"
              class="effect-value"
              :class="
                operation.kind === 'advance'
                  ? 'advance-color'
                  : operation.kind === 'delay'
                    ? 'delay-color'
                    : ''
              "
              >{{ operation.amount > 0 ? '+' : '' }}{{ operation.amount
              }}{{
                operation.kind !== 'speed' || operation.mode === 'percent' ? '%' : ' SPD'
              }}</strong
            >
            <div class="operation-actions">
              <Button
                v-tooltip="t('spike.edit')"
                text
                rounded
                size="small"
                severity="secondary"
                :aria-label="`${t('spike.edit')}: ${t(`spike.${operation.kind}`)}`"
                @click="emit('edit', operation)"
                ><Pencil :size="15" :stroke-width="1.75" /></Button
              ><Button
                v-tooltip="t('spike.remove')"
                text
                rounded
                size="small"
                severity="secondary"
                :aria-label="`${t('spike.remove')}: ${t(`spike.${operation.kind}`)}`"
                @click="emit('remove', operation.id)"
                ><Trash2 :size="15" :stroke-width="1.75"
              /></Button>
            </div>
          </div>
          <div v-if="operation.kind !== 'event'" class="operation-targets">
            <span v-for="id in operation.targets" :key="id" class="compact-target"
              ><GameIcon
                :asset-key="target(id)?.assetKey"
                :name="target(id) ? characterName(target(id)!, locale as ToolLocale) : id"
                :fallback="t('planner.imageMissing')"
              /><span>{{
                target(id) ? characterName(target(id)!, locale as ToolLocale) : id
              }}</span></span
            >
          </div>
          <div v-else class="event-details">
            <strong>{{ operation.name }}</strong
            ><span>{{ operation.speed }} SPD</span>
          </div>
          <div class="operation-bottom">
            <span class="phase-tag">{{ t(`spike.${operation.phase}`) }}</span
            ><span v-if="operation.kind === 'speed'" class="muted"
              >{{
                operation.duration.kind === 'turns'
                  ? t('spike.turnDuration', { count: operation.duration.turns })
                  : t('spike.countdownDuration', { name: operation.duration.name })
              }}<template v-if="operation.duration.kind === 'countdown'">
                · {{ operation.duration.speed }} SPD</template
              ></span
            ><span v-else-if="operation.kind === 'event'" class="muted">{{
              t('spike.eventNode')
            }}</span>
          </div>
        </article>
      </div>
      <p class="fine-print overview-note">{{ t('spike.localOnly') }}</p>
    </div>
  </section>
</template>
