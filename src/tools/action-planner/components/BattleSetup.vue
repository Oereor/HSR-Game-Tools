<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { Plus, Trash2 } from '@lucide/vue'
import GameIcon from '../../../components/ui/GameIcon.vue'
import { gameData, characterName, assetUrl } from '../../../data/adapters/game-data'
import { HARD_LIMITS } from '../../../engine/action-planner/queue'
import type { ActorConfig, SimulationPlan } from '../../../engine/action-planner/types'
import type { ToolLocale } from '../../../locales/types'
import type { CharacterRecord } from '../../../data/schema'
import { createCharacterSearch } from '../model/character-search'
import { formatNumber } from '../model/presentation'
const props = defineProps<{
  plan: SimulationPlan
  characterIds: Record<string, string>
  nextId: () => string
}>()
const emit = defineEmits<{
  apply: [
    actors: ActorConfig[],
    maxNodes: number,
    maxAV: number,
    characters: Record<string, string>,
  ]
}>()
const { t, locale } = useI18n()
type Slot = {
  id: string
  characterId: string
  baseSpeed: number | undefined
  panelSpeed: number | undefined
}
const slots = ref<Slot[]>([])
const maxNodes = ref<number | undefined>()
const maxAV = ref<number | undefined>()
const errors = ref<string[]>([])
const dirty = ref(false)
function load() {
  slots.value = Array.from({ length: 4 }, (_, position) => {
    const a = props.plan.actors.find((a) => a.camp === 'ally' && a.position === position)
    return {
      id: a?.id ?? '',
      characterId: a ? (props.characterIds[a.id] ?? '') : '',
      baseSpeed: a?.baseSpeed,
      panelSpeed: a?.panelSpeed,
    }
  })
  maxNodes.value = props.plan.maxNodes
  maxAV.value = props.plan.maxAV
  errors.value = []
  dirty.value = false
}
watch([() => props.plan.actors, () => props.plan.maxNodes, () => props.plan.maxAV], load, {
  immediate: true,
})
const visible = ref(false)
const choosing = ref(0)
const query = ref('')
const search = computed(() =>
  createCharacterSearch(gameData.characters, locale.value as ToolLocale),
)
const choices = computed(() => {
  const q = query.value.trim()
  const byName = search.value(q)
  if (!q) return byName
  const matched = gameData.characters.filter((c) =>
    t(`ui.path.${c.form.pathCode}`).toLowerCase().includes(q.toLowerCase()),
  )
  return [...byName, ...matched.filter((c) => !byName.some((x) => x.id === c.id))]
})
const current = (slot: Slot) => gameData.characters.find((c) => c.id === slot.characterId)
const choiceName = (c: CharacterRecord) =>
  c.form.gender
    ? t('planner.characterForm', {
        name: characterName(c, locale.value as ToolLocale),
        gender: t(c.form.gender === 'male' ? 'planner.genderMale' : 'planner.genderFemale'),
      })
    : characterName(c, locale.value as ToolLocale)
const occupied = (id: string) =>
  slots.value.some((s, i) => i !== choosing.value && s.characterId === id)
function choose(index: number) {
  choosing.value = index
  query.value = ''
  visible.value = true
}
function replace(c: CharacterRecord) {
  if (occupied(c.id)) return
  const old = slots.value[choosing.value]!
  if (old.characterId !== c.id)
    slots.value[choosing.value] = {
      id: props.nextId(),
      characterId: c.id,
      baseSpeed: c.baseSpeed,
      panelSpeed: c.baseSpeed,
    }
  dirty.value = true
  visible.value = false
}
function clear(index: number) {
  slots.value[index] = { id: '', characterId: '', baseSpeed: undefined, panelSpeed: undefined }
  dirty.value = true
}
const positive = (v: number | undefined) => v !== undefined && Number.isFinite(v) && v > 0
function apply() {
  const invalid: string[] = []
  slots.value.forEach((s, i) => {
    if (s.characterId) {
      if (!positive(s.baseSpeed)) invalid.push(`base-${i}`)
      if (!positive(s.panelSpeed)) invalid.push(`panel-${i}`)
    }
  })
  if (
    !positive(maxNodes.value) ||
    !Number.isSafeInteger(maxNodes.value) ||
    maxNodes.value! > HARD_LIMITS.maxNodes
  )
    invalid.push('maxNodes')
  if (!positive(maxAV.value) || maxAV.value! > HARD_LIMITS.maxAV) invalid.push('maxAV')
  errors.value = invalid
  if (invalid.length) return
  const actors: ActorConfig[] = slots.value.flatMap((s, position) => {
    const c = current(s)
    return c
      ? [
          {
            id: s.id,
            name: c.names['zh-CN'],
            iconUrl: assetUrl(c.assetKey),
            kind: 'actor' as const,
            camp: 'ally' as const,
            category: 'character' as const,
            position,
            baseSpeed: s.baseSpeed!,
            panelSpeed: s.panelSpeed!,
          },
        ]
      : []
  })
  emit(
    'apply',
    actors,
    maxNodes.value!,
    maxAV.value!,
    Object.fromEntries(slots.value.filter((s) => s.characterId).map((s) => [s.id, s.characterId])),
  )
}
</script>
<template>
  <section class="setup-view">
    <div class="section-title">
      <h2>{{ t('ui.team') }}</h2>
      <span v-if="dirty" class="quiet-tag">{{ t('ui.unapplied') }}</span>
    </div>
    <div class="team-grid">
      <section v-for="(slot, index) in slots" :key="index" class="team-slot">
        <div class="slot-top">
          <span class="slot-number">0{{ index + 1 }}</span
          ><Button
            v-if="slot.characterId"
            v-tooltip="t('ui.clear')"
            text
            rounded
            severity="secondary"
            :aria-label="
              t('planner.accessibility.clearSlot', {
                slot: formatNumber(index + 1, locale as ToolLocale),
              })
            "
            @click="clear(index)"
            ><Trash2 :size="16" :stroke-width="1.75"
          /></Button>
        </div>
        <button
          class="portrait-button"
          :aria-label="
            t('planner.accessibility.chooseSlot', {
              slot: formatNumber(index + 1, locale as ToolLocale),
            })
          "
          @click="choose(index)"
        >
          <GameIcon
            v-if="current(slot)"
            :asset-key="current(slot)?.assetKey"
            :name="characterName(current(slot)!, locale as ToolLocale)"
            :fallback="t('planner.imageMissing')"
          /><span v-else class="empty-portrait"><Plus :size="28" :stroke-width="1.75" /></span>
        </button>
        <h3
          class="character-name"
          :title="current(slot) ? characterName(current(slot)!, locale as ToolLocale) : ''"
        >
          {{
            current(slot) ? characterName(current(slot)!, locale as ToolLocale) : t('ui.emptySlot')
          }}
        </h3>
        <div v-if="slot.characterId" class="slot-speeds">
          <div class="field">
            <label :for="`base-${index}`">{{ t('ui.baseSpeed') }}</label
            ><InputNumber
              v-model="slot.baseSpeed"
              :input-id="`base-${index}`"
              :locale="locale"
              :use-grouping="false"
              :max-fraction-digits="20"
              :invalid="errors.includes(`base-${index}`)"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby': errors.includes(`base-${index}`)
                      ? `base-error-${index}`
                      : undefined,
                  },
                },
              }"
              fluid
              @update:model-value="dirty = true"
            /><small
              v-if="errors.includes(`base-${index}`)"
              :id="`base-error-${index}`"
              class="field-error"
              >{{ t('ui.positive') }}</small
            >
          </div>
          <div class="field">
            <label :for="`panel-${index}`">{{ t('ui.panelSpeed') }}</label
            ><InputNumber
              v-model="slot.panelSpeed"
              :input-id="`panel-${index}`"
              :locale="locale"
              :use-grouping="false"
              :max-fraction-digits="20"
              :invalid="errors.includes(`panel-${index}`)"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby': errors.includes(`panel-${index}`)
                      ? `panel-error-${index}`
                      : undefined,
                  },
                },
              }"
              fluid
              @update:model-value="dirty = true"
            /><small
              v-if="errors.includes(`panel-${index}`)"
              :id="`panel-error-${index}`"
              class="field-error"
              >{{ t('ui.positive') }}</small
            >
          </div>
        </div>
      </section>
    </div>
    <section class="range-section">
      <h2>{{ t('ui.range') }}</h2>
      <div class="form-grid">
        <div class="field">
          <label for="max-nodes">{{ t('ui.maxNodes') }}</label
          ><InputNumber
            v-model="maxNodes"
            input-id="max-nodes"
            :use-grouping="false"
            :max-fraction-digits="20"
            :invalid="errors.includes('maxNodes')"
            :pt="{
              pcInputText: {
                root: {
                  'aria-describedby': errors.includes('maxNodes') ? 'nodes-error' : undefined,
                },
              },
            }"
            fluid
            @update:model-value="dirty = true"
          /><small v-if="errors.includes('maxNodes')" id="nodes-error" class="field-error">{{
            t('ui.nodeBudget')
          }}</small>
        </div>
        <div class="field">
          <label for="max-av">{{ t('ui.maxAV') }}</label
          ><InputNumber
            v-model="maxAV"
            input-id="max-av"
            :use-grouping="false"
            :max-fraction-digits="20"
            :invalid="errors.includes('maxAV')"
            :pt="{
              pcInputText: {
                root: { 'aria-describedby': errors.includes('maxAV') ? 'av-error' : undefined },
              },
            }"
            fluid
            @update:model-value="dirty = true"
          /><small v-if="errors.includes('maxAV')" id="av-error" class="field-error">{{
            t('ui.avBudget')
          }}</small>
        </div>
      </div>
    </section>
    <div class="setup-footer"><Button :label="t('ui.applySetup')" @click="apply" /></div>
    <Dialog
      v-model:visible="visible"
      modal
      :header="t('ui.choose')"
      :close-button-props="{ 'aria-label': t('ui.close') }"
      :style="{ width: '720px', maxWidth: 'calc(100vw - 32px)' }"
      ><label class="sr-only" for="character-search">{{ t('ui.search') }}</label
      ><InputText
        id="character-search"
        v-model="query"
        :placeholder="t('ui.search')"
        fluid
        autofocus
      />
      <p class="fine-print search-count">
        {{ t('ui.characters', { count: formatNumber(choices.length, locale as ToolLocale) }) }}
      </p>
      <div class="chooser-grid character-choices">
        <button
          v-for="c in choices"
          :key="c.id"
          class="target-button"
          :disabled="occupied(c.id)"
          :aria-pressed="slots[choosing]?.characterId === c.id"
          :title="choiceName(c)"
          :aria-label="choiceName(c)"
          @click="replace(c)"
        >
          <GameIcon
            :asset-key="c.assetKey"
            :name="characterName(c, locale as ToolLocale)"
            :fallback="t('planner.imageMissing')"
          /><span>{{ choiceName(c) }}</span>
        </button>
      </div>
      <p v-if="!choices.length" class="muted">{{ t('ui.noMatches') }}</p></Dialog
    >
  </section>
</template>
