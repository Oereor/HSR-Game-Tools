<script setup lang="ts">
import { computed, nextTick, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import {
  Ticket,
  Tickets as TicketsIcon,
  UsersRound,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  History,
} from '@lucide/vue'
import type { ToolLocale } from '../../locales/types'
import { warpSnapshot, warpVisuals, warpVisualDefinitions } from './data/adapters/warp-data'
import { useWarpSimulator, type HistoryEntry } from './composables/useWarpSimulator'
import { useWarpOverlay } from './composables/useWarpOverlay'
import { createPresentation } from './model/presentation'
import WarpPityPanel from './components/WarpPityPanel.vue'
import WarpItemVisual from './components/WarpItemVisual.vue'
import WarpSelectionDialog from './components/WarpSelectionDialog.vue'
import WarpResultCard from './components/WarpResultCard.vue'
import WarpHistory from './components/WarpHistory.vue'
import WarpItemDetails from './components/WarpItemDetails.vue'

const { t, locale } = useI18n()
const simulator = useWarpSimulator()
const {
  session,
  selectedBannerId,
  activeBanner,
  selectedAvatarIds,
  selectionDraft,
  selectionOpen,
  selectionValid,
  pity,
  latestResults,
  visibleHistory,
  historyPage,
  busy,
  diagnostic,
  resetScope,
  announcement,
  canPull,
} = simulator
const overlay = useWarpOverlay()
const { panel } = overlay
const details = shallowRef<HistoryEntry>()
const presentation = createPresentation(
  warpSnapshot,
  warpVisuals,
  import.meta.env.BASE_URL,
  warpVisualDefinitions,
)
const item = (id: string) => presentation.item(id, locale.value as ToolLocale)
function sourceLabel(bannerId: string) {
  const banner = warpSnapshot.banners.find((entry) => entry.id === bannerId)
  return banner
    ? banner.up5
      ? t('warp.bannerSource', { name: item(banner.up5).name, type: t(`warp.kind.${banner.kind}`) })
      : t(`warp.kind.${banner.kind}`)
    : bannerId
}
const bannerOptions = computed(() =>
  simulator.banners.map(({ banner }) => ({ id: banner.id, label: sourceLabel(banner.id) })),
)
const upItem = computed(() =>
  activeBanner.value?.banner.up5 ? item(activeBanner.value.banner.up5) : undefined,
)
const controlsLocked = computed(() => busy.value || selectionOpen.value || !!resetScope.value)
const needsSelection = computed(
  () => activeBanner.value?.requiresSelection && selectedAvatarIds.value.length !== 7,
)
function focus(id: string | undefined) {
  if (id) void nextTick(() => document.getElementById(id)?.focus())
}
function afterPanelHide() {
  focus(overlay.afterPanelHide())
}
function afterPanelShow() {
  focus(overlay.takeFocus())
}
function afterDialogHide() {
  focus(overlay.afterDialogHide())
}
function openSelection(triggerId: string) {
  overlay.openDialog(() => {
    simulator.openSelection()
  }, triggerId)
}
function openReset(scope: 'group' | 'all') {
  overlay.openDialog(() => {
    simulator.requestReset(scope)
  }, `warp-reset-${scope}`)
}
function showDetails(entry: HistoryEntry, source: 'result' | 'history') {
  overlay.openDialog(() => {
    details.value = entry
  }, `warp-${source}-${entry.id}`)
}
</script>

<template>
  <div class="warp-page">
    <header class="warp-page-heading">
      <div class="warp-page-title">
        <Ticket :size="24" :stroke-width="1.75" aria-hidden="true" />
        <h1>{{ t('warp.title') }}</h1>
      </div>
      <p class="warp-current-banner">
        {{ activeBanner ? sourceLabel(activeBanner.banner.id) : t('warp.noBanners') }}
      </p>
      <div class="warp-panel-actions">
        <Button
          id="warp-controls-trigger"
          :label="t('warp.panels.controls')"
          severity="secondary"
          outlined
          :aria-expanded="panel === 'controls'"
          aria-controls="warp-controls-drawer"
          @click="overlay.openPanel('controls')"
          ><template #icon><SlidersHorizontal :size="16" aria-hidden="true" /></template
        ></Button>
        <Button
          id="warp-history-trigger"
          :label="t('warp.history.title')"
          severity="secondary"
          outlined
          :aria-expanded="panel === 'history'"
          aria-controls="warp-history-drawer"
          @click="overlay.openPanel('history')"
          ><template #icon><History :size="16" aria-hidden="true" /></template
        ></Button>
      </div>
    </header>
    <section aria-labelledby="warp-results-title" class="warp-results">
      <div class="warp-results-heading">
        <h2 id="warp-results-title">
          <Sparkles :size="18" aria-hidden="true" />{{ t('warp.results.title') }}
        </h2>
        <span v-if="latestResults.length">{{
          t('warp.results.count', { count: latestResults.length })
        }}</span>
      </div>
      <p v-if="latestResults.length" class="warp-result-source">
        {{ sourceLabel(latestResults[0].event.bannerId) }}
      </p>
      <div v-if="!latestResults.length" class="warp-results-empty">
        <Ticket :size="36" :stroke-width="1.25" aria-hidden="true" />
        <p>{{ t('warp.results.empty') }}</p>
      </div>
      <div
        v-else
        class="warp-result-grid"
        :class="{
          'warp-ten-grid': latestResults.length === 10,
          'warp-single-grid': latestResults.length === 1,
        }"
      >
        <WarpResultCard
          v-for="(entry, index) in latestResults"
          :key="`${entry.batchId}:${entry.id}`"
          :entry="entry"
          :item="item(entry.event.itemId)"
          :index="index"
          :single="latestResults.length === 1"
          @details="showDetails($event, 'result')"
        />
      </div>
    </section>
    <div class="warp-actionbar">
      <p id="warp-choice-status" class="warp-action-status">
        {{
          !activeBanner
            ? t('warp.noBanners')
            : needsSelection
              ? t('warp.selection.required')
              : activeBanner.requiresSelection
                ? t('warp.selection.ready')
                : t('warp.panels.ready')
        }}
      </p>
      <Button
        v-if="activeBanner?.requiresSelection"
        id="warp-action-selection"
        :label="t(selectedAvatarIds.length ? 'warp.selection.edit' : 'warp.selection.choose')"
        size="small"
        severity="secondary"
        outlined
        :disabled="controlsLocked"
        @click="openSelection('warp-action-selection')"
        ><template #icon><UsersRound :size="16" aria-hidden="true" /></template
      ></Button>
      <div class="warp-actions" :aria-busy="busy">
        <Button
          :label="t('warp.pullOne')"
          severity="secondary"
          outlined
          :disabled="!canPull"
          :aria-describedby="diagnostic ? 'warp-draw-error' : 'warp-choice-status'"
          @click="simulator.draw(1)"
          ><template #icon><Ticket :size="17" aria-hidden="true" /></template
        ></Button>
        <Button
          :label="t('warp.pullTen')"
          :disabled="!canPull"
          :aria-describedby="diagnostic ? 'warp-draw-error' : 'warp-choice-status'"
          @click="simulator.draw(10)"
          ><template #icon><TicketsIcon :size="17" aria-hidden="true" /></template
        ></Button>
      </div>
      <p v-if="diagnostic" id="warp-draw-error" class="warp-error" role="alert">
        {{ t(`warp.error.${diagnostic.code}`) }}
      </p>
    </div>
    <Drawer
      block-scroll
      id="warp-controls-drawer"
      :visible="panel === 'controls'"
      position="left"
      :header="t('warp.panels.controls')"
      :style="{ width: '25rem', maxWidth: '100vw' }"
      :close-button-props="{ 'aria-label': t('warp.panels.closeControls') }"
      @update:visible="
        (value) => {
          if (!value) overlay.closePanel()
        }
      "
      @after-hide="afterPanelHide"
      @after-show="afterPanelShow"
    >
      <section class="warp-controls" aria-labelledby="warp-banner-heading">
        <h2 id="warp-banner-heading">{{ t('warp.bannerTitle') }}</h2>
        <label id="warp-banner-label" for="warp-banner" class="warp-field-label">{{
          t('warp.bannerSelect')
        }}</label>
        <Select
          input-id="warp-banner"
          aria-labelledby="warp-banner-label"
          :model-value="selectedBannerId"
          :options="bannerOptions"
          option-label="label"
          option-value="id"
          :disabled="controlsLocked || !bannerOptions.length"
          :placeholder="t('warp.noBanners')"
          :empty-message="t('warp.noBanners')"
          :selection-message="t('warp.bannerSelected')"
          :empty-selection-message="t('warp.bannerNoneSelected')"
          class="warp-banner-select"
          @update:model-value="simulator.selectBanner($event)"
        />
        <p v-if="!activeBanner" class="warp-muted">{{ t('warp.noBanners') }}</p>
        <template v-else>
          <div v-if="upItem" class="warp-banner-featured">
            <span class="warp-banner-portrait"><WarpItemVisual :item="upItem" /></span>
            <div class="warp-banner-identity">
              <Tag :value="t(`warp.kind.${activeBanner.banner.kind}`)" severity="secondary" />
              <h3>{{ upItem.name }}</h3>
              <span class="warp-featured-label">{{ t('warp.fiveUp') }}</span>
            </div>
          </div>
          <p v-if="activeBanner.banner.up4?.length" class="warp-four-up">
            {{
              t('warp.fourUp', {
                names: activeBanner.banner.up4.map((id) => item(id).name).join(' · '),
              })
            }}
          </p>
          <WarpPityPanel
            v-if="pity"
            :pity="pity"
            :has-up5="!!activeBanner.banner.up5"
            :has-up4="!!activeBanner.banner.up4?.length"
          />
          <div v-if="activeBanner.requiresSelection" class="warp-affinity">
            <div class="warp-section-heading">
              <h3>{{ t('warp.selection.title') }}</h3>
              <span>{{ t('warp.selection.count', { count: selectedAvatarIds.length }) }}</span>
            </div>
            <ul
              v-if="selectedAvatarIds.length"
              class="warp-selected-avatars"
              :aria-label="t('warp.selection.chosen')"
            >
              <li v-for="id in selectedAvatarIds" :key="id" :title="item(id).name">
                <WarpItemVisual :item="item(id)" />
              </li>
            </ul>
            <Button
              :label="t(selectedAvatarIds.length ? 'warp.selection.edit' : 'warp.selection.choose')"
              severity="secondary"
              outlined
              :disabled="controlsLocked"
              aria-describedby="warp-choice-status"
              id="warp-selection-trigger"
              @click="openSelection('warp-selection-trigger')"
              ><template #icon><UsersRound :size="16" aria-hidden="true" /></template
            ></Button>
            <p id="warp-control-choice-status" class="warp-muted">
              {{
                t(
                  selectedAvatarIds.length === 7
                    ? 'warp.selection.ready'
                    : 'warp.selection.required',
                )
              }}
            </p>
          </div>
        </template>
        <div class="warp-reset-actions">
          <Button
            :label="t('warp.reset.group')"
            size="small"
            severity="secondary"
            text
            :disabled="controlsLocked || !activeBanner"
            id="warp-reset-group"
            @click="openReset('group')"
            ><template #icon><RotateCcw :size="14" aria-hidden="true" /></template
          ></Button>
          <Button
            :label="t('warp.reset.all')"
            size="small"
            severity="secondary"
            text
            :disabled="controlsLocked"
            id="warp-reset-all"
            @click="openReset('all')"
          />
        </div>
        <p class="warp-memory-note">{{ t('warp.memoryOnly') }}</p>
      </section>
    </Drawer>
    <Drawer
      block-scroll
      id="warp-history-drawer"
      :visible="panel === 'history'"
      position="right"
      :header="t('warp.history.title')"
      :style="{ width: '49rem', maxWidth: '100vw' }"
      :close-button-props="{ 'aria-label': t('warp.panels.closeHistory') }"
      @update:visible="
        (value) => {
          if (!value) overlay.closePanel()
        }
      "
      @after-hide="afterPanelHide"
      @after-show="afterPanelShow"
    >
      <WarpHistory
        :entries="visibleHistory"
        :total="session.history.length"
        :page="historyPage"
        :presentation="presentation"
        @page="simulator.setHistoryPage"
        @details="showDetails($event, 'history')"
      />
    </Drawer>
    <div class="warp-sr-only" role="status" aria-live="polite" aria-atomic="true">
      <span v-if="announcement" :key="`${announcement.key}:${announcement.batchId ?? ''}`">{{
        t(announcement.key, { count: announcement.count ?? 0 })
      }}</span>
    </div>
    <WarpSelectionDialog
      :visible="selectionOpen"
      :draft="selectionDraft"
      :eligible-ids="activeBanner?.eligibleAvatarIds ?? []"
      :valid="selectionValid"
      :presentation="presentation"
      @update:draft="simulator.setSelectionDraft"
      @cancel="simulator.cancelSelection"
      @confirm="simulator.confirmSelection"
      @after-hide="afterDialogHide"
    />
    <WarpItemDetails
      :entry="details"
      :item="details ? item(details.event.itemId) : undefined"
      :source-label="details ? sourceLabel(details.event.bannerId) : ''"
      @close="details = undefined"
      @after-hide="afterDialogHide"
    />
    <Dialog
      :visible="!!resetScope"
      modal
      :draggable="false"
      :header="t('warp.reset.title')"
      :style="{ width: '29rem', maxWidth: 'calc(100vw - 32px)' }"
      :close-button-props="{ 'aria-label': t('warp.cancel') }"
      @update:visible="
        (value) => {
          if (!value) simulator.cancelReset()
        }
      "
      @after-hide="afterDialogHide"
    >
      <p class="warp-reset-description">
        {{ t(resetScope === 'group' ? 'warp.reset.groupConfirm' : 'warp.reset.allConfirm') }}
      </p>
      <template #footer
        ><Button
          :label="t('warp.cancel')"
          autofocus
          severity="secondary"
          outlined
          @click="simulator.cancelReset" /><Button
          :label="t('warp.reset.confirm')"
          @click="simulator.confirmReset"
      /></template>
    </Dialog>
  </div>
</template>

<style scoped>
.warp-field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-muted);
}
.warp-banner-select {
  width: 100%;
  min-width: 0;
}
.warp-banner-featured {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 24px 0 14px;
}
.warp-banner-portrait {
  width: 88px;
  height: 88px;
  flex-shrink: 0;
}
.warp-banner-identity {
  min-width: 0;
}
.warp-banner-identity h3 {
  margin: 9px 0 4px;
  font-size: 22px;
  overflow-wrap: anywhere;
}
.warp-featured-label,
.warp-four-up {
  font-size: 12px;
  color: var(--color-muted);
}
.warp-four-up {
  margin: 0 0 18px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.warp-affinity {
  padding-top: 20px;
}
.warp-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.warp-section-heading h3 {
  margin: 0;
  font-size: 14px;
}
.warp-section-heading > span {
  font-size: 12px;
  color: var(--color-muted);
}
.warp-selected-avatars {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}
.warp-selected-avatars li {
  width: 32px;
  height: 32px;
}
.warp-muted {
  margin: 10px 0 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
}
.warp-reset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 16px -8px 0;
}
.warp-memory-note {
  font-size: 11px;
  color: var(--color-muted);
  line-height: 1.7;
  margin: 16px 0 0;
}
.warp-error {
  color: var(--p-red-300);
  font-size: 13px;
  line-height: 1.6;
}

.warp-page {
  min-width: 0;
}
.warp-page-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  margin-bottom: 28px;
}
.warp-page-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.warp-page-title > svg {
  color: var(--color-accent);
}
.warp-page-title h1 {
  margin: 0;
  font-size: clamp(1.5rem, 3vw, 2rem);
}
.warp-current-banner {
  font-size: 12px;
  color: var(--color-muted);
  flex: 1 1 220px;
  margin: 0;
  overflow-wrap: anywhere;
}
.warp-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.warp-results {
  min-height: max(380px, calc(100dvh - 330px));
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px 8px 28px;
}
.warp-results-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.warp-results-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  margin: 0;
}
.warp-results-heading > span,
.warp-result-source {
  font-size: 12px;
  color: var(--color-muted);
}
.warp-result-source {
  margin: 0 0 20px;
  overflow-wrap: anywhere;
}
.warp-results-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  flex: 1;
  min-height: 280px;
  border: 1px dashed var(--color-line);
  border-radius: 8px;
  padding: 24px;
  color: var(--color-muted);
  text-align: center;
  font-size: 13px;
}
.warp-result-grid {
  display: grid;
  gap: clamp(12px, 1.7vw, 22px);
  align-content: center;
  flex: 1;
}
.warp-single-grid {
  justify-items: center;
}
.warp-ten-grid {
  grid-template-columns: repeat(8, minmax(0, 1fr));
}
.warp-ten-grid > * {
  grid-column: span 2;
}
.warp-ten-grid > :nth-child(1),
.warp-ten-grid > :nth-child(8) {
  grid-column: 2 / span 2;
}
.warp-ten-grid > :nth-child(4) {
  grid-column: 1 / span 2;
}
.warp-actionbar {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 10px 16px;
  padding: 14px 12px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-line);
  background: var(--color-page);
  z-index: 1;
}
.warp-action-status {
  flex: 1 1 210px;
  margin: 0;
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.6;
}
.warp-actions {
  display: flex;
  gap: 10px;
}
.warp-actionbar .warp-error {
  flex-basis: 100%;
  margin: 0;
}
.warp-controls {
  min-width: 0;
}
.warp-controls h2 {
  margin: 0 0 20px;
  font-size: 16px;
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
.warp-reset-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
}
@media (max-width: 1039px) {
  .warp-ten-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .warp-ten-grid > *,
  .warp-ten-grid > :nth-child(1),
  .warp-ten-grid > :nth-child(4),
  .warp-ten-grid > :nth-child(8) {
    grid-column: auto;
  }
  .warp-page-heading {
    margin-bottom: 16px;
  }
  .warp-panel-actions {
    width: 100%;
  }
}
@media (max-width: 400px) {
  .warp-ten-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .warp-actions {
    width: 100%;
  }
  .warp-actions > * {
    flex: 1;
  }
}
</style>
