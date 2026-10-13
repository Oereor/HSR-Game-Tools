<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { Plus, ArrowRight, UsersRound } from '@lucide/vue'
import GameIcon from '../../../components/ui/GameIcon.vue'
import { gameData, characterName } from '../../../data/adapters/game-data'
import { sampleCharacters, sampleSpeeds } from '../prototype/sample'
import type { ToolLocale } from '../../../locales/types'
const emit = defineEmits<{ continue: [] }>()
const { t, locale } = useI18n()
const slots = ref(
  sampleCharacters.map((character, i) => ({ character, speed: sampleSpeeds[i] as number | null })),
)
const maxAV = ref<number | null>(300)
const maxNodes = ref<number | null>(14)
const choosing = ref<number>()
const visible = ref(false)
const choices = gameData.characters.filter((c) =>
  ['1001', '1101', '1208', '1306', '1003', '1205', '1102', '1204'].includes(c.id),
)
const valid = (v: number | null) => v !== null && Number.isFinite(v) && v > 0
function choose(index: number) {
  choosing.value = index
  visible.value = true
}
function replace(character: (typeof sampleCharacters)[number]) {
  if (choosing.value !== undefined) slots.value[choosing.value]!.character = character
  visible.value = false
}
</script>
<template>
  <section class="setup-view">
    <div class="section-title">
      <div>
        <h2>{{ t('spike.team') }}</h2>
        <p class="muted">{{ t('spike.teamNote') }}</p>
      </div>
      <span class="quiet-tag">{{ t('spike.snapshot') }}</span>
    </div>
    <div class="team-grid">
      <section v-for="(slot, index) in slots" :key="index" class="team-slot">
        <div class="slot-top">
          <span class="slot-number">0{{ index + 1 }}</span
          ><Button
            v-tooltip="t('spike.choose')"
            :aria-label="`${t('spike.choose')} ${index + 1}`"
            text
            rounded
            severity="secondary"
            @click="choose(index)"
            ><Plus :size="18" :stroke-width="1.75"
          /></Button>
        </div>
        <button
          class="portrait-button"
          :aria-label="`${t('spike.choose')}: ${characterName(slot.character, locale as ToolLocale)}`"
          @click="choose(index)"
        >
          <GameIcon
            :asset-key="slot.character.assetKey"
            :name="characterName(slot.character, locale as ToolLocale)"
            :fallback="t('planner.imageMissing')"
          />
        </button>
        <h3 class="character-name" :title="characterName(slot.character, locale as ToolLocale)">
          {{ characterName(slot.character, locale as ToolLocale) }}
        </h3>
        <div class="base-stat">
          <span>{{ t('spike.baseSpeed') }}</span
          ><strong>{{ slot.character.baseSpeed ?? '—' }}</strong>
        </div>
        <label :for="`speed-${index}`">{{ t('spike.panelSpeed') }}</label>
        <InputNumber
          v-model="slot.speed"
          :input-id="`speed-${index}`"
          :locale="locale"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
          :use-grouping="false"
          :invalid="!valid(slot.speed)"
          :pt="{
            pcInputText: {
              root: { 'aria-describedby': !valid(slot.speed) ? `speed-error-${index}` : undefined },
            },
          }"
          fluid
        />
        <small v-if="!valid(slot.speed)" :id="`speed-error-${index}`" class="field-error">{{
          t('spike.invalidNumber')
        }}</small>
      </section>
    </div>
    <div class="setup-bottom">
      <section class="range-section">
        <h2>{{ t('spike.range') }}</h2>
        <div class="form-grid">
          <div class="field">
            <label for="max-av">{{ t('spike.maxAV') }}</label
            ><InputNumber
              v-model="maxAV"
              input-id="max-av"
              :use-grouping="false"
              :invalid="!valid(maxAV)"
              :pt="{
                pcInputText: {
                  root: { 'aria-describedby': !valid(maxAV) ? 'max-av-error' : undefined },
                },
              }"
              fluid
            /><small v-if="!valid(maxAV)" id="max-av-error" class="field-error">{{
              t('spike.invalidNumber')
            }}</small>
          </div>
          <div class="field">
            <label for="max-nodes">{{ t('spike.maxNodes') }}</label
            ><InputNumber
              v-model="maxNodes"
              input-id="max-nodes"
              :use-grouping="false"
              :invalid="!valid(maxNodes) || !Number.isSafeInteger(maxNodes)"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby':
                      !valid(maxNodes) || !Number.isSafeInteger(maxNodes)
                        ? 'max-nodes-error'
                        : undefined,
                  },
                },
              }"
              fluid
            /><small
              v-if="!valid(maxNodes) || !Number.isSafeInteger(maxNodes)"
              id="max-nodes-error"
              class="field-error"
              >{{ t('spike.invalidInteger') }}</small
            >
          </div>
        </div>
        <p class="fine-print">{{ t('spike.scopeNote') }}</p>
      </section>
      <section class="enemy-placeholder">
        <UsersRound :size="24" :stroke-width="1.75" />
        <h2>{{ t('spike.enemy') }}</h2>
        <p class="muted">{{ t('spike.enemyNote') }}</p>
        <Button :label="t('spike.enemyChoose')" disabled text severity="secondary" size="small" />
      </section>
    </div>
    <div class="setup-footer">
      <Button @click="emit('continue')"
        >{{ t('spike.continue') }}<ArrowRight :size="18" :stroke-width="1.75"
      /></Button>
    </div>
    <Dialog
      v-model:visible="visible"
      modal
      :header="t('spike.chooseTitle')"
      :close-button-props="{ 'aria-label': t('spike.close') }"
      :style="{ width: '620px', maxWidth: 'calc(100vw - 32px)' }"
      ><p class="muted dialog-note">{{ t('spike.chooseNote') }}</p>
      <div class="chooser-grid">
        <button
          v-for="character in choices"
          :key="character.id"
          class="target-button"
          :aria-pressed="choosing !== undefined && slots[choosing]?.character.id === character.id"
          @click="replace(character)"
        >
          <GameIcon
            :asset-key="character.assetKey"
            :name="characterName(character, locale as ToolLocale)"
            :fallback="t('planner.imageMissing')"
          /><span>{{ characterName(character, locale as ToolLocale) }}</span>
        </button>
      </div></Dialog
    >
  </section>
</template>
