<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import Select from 'primevue/select'
import Badge from 'primevue/badge'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import {
  Ticket,
  Tickets as TicketsIcon,
  UsersRound,
  RotateCcw,
  SlidersHorizontal,
  History,
} from '@lucide/vue'
import type { ToolLocale } from '../../locales/types'
import type { WarpBannerKind } from './data/schema'
import { warpSnapshot, warpVisuals, warpVisualDefinitions } from './data/adapters/warp-data'
import { useWarpSimulator, type HistoryEntry } from './composables/useWarpSimulator'
import { useWarpOverlay } from './composables/useWarpOverlay'
import { useWarpReveal } from './composables/useWarpReveal'
import { useWarpReducedMotion } from './composables/useWarpReducedMotion'
import WarpRevealOverlay from './components/WarpRevealOverlay.vue'
import { createPresentation } from './model/presentation'
import WarpPityPanel from './components/WarpPityPanel.vue'
import WarpItemVisual from './components/WarpItemVisual.vue'
import WarpSelectionDialog from './components/WarpSelectionDialog.vue'
import WarpResults from './components/WarpResults.vue'
import WarpHistory from './components/WarpHistory.vue'
import WarpItemDetails from './components/WarpItemDetails.vue'

const { t, locale } = useI18n()
const simulator = useWarpSimulator()
const {
  session,
  selectedBannerId,
  activeBanner,
  selectedAvatarIds,
  activeKind,
  selectionIssue,
  storageNotice,
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
const reveal = useWarpReveal(useWarpReducedMotion())
const {
  visible: revealVisible,
  locked: revealLocked,
  phase: revealPhase,
  artworkReady,
  identityReady,
  current: revealEntry,
  displayedEntries,
} = reveal
let revealTrigger: string | undefined
watch(
  () => session.value.latestBatchId,
  (batchId) => {
    if (batchId === undefined) reveal.reset()
    else reveal.beginBatch(batchId, latestResults.value)
  },
  { flush: 'sync' },
)
function draw(count: 1 | 10) {
  if (revealLocked.value) return
  revealTrigger = count === 1 ? 'warp-pull-one' : 'warp-pull-ten'
  void simulator.draw(count)
}
function afterRevealHide() {
  if (reveal.afterHide()) focus(revealTrigger)
}
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
  simulator.kindBanners.value.map(({ banner }) => ({
    id: banner.id,
    label: banner.up5 ? item(banner.up5).name : t(`warp.kind.${banner.kind}`),
  })),
)
const upItem = computed(() =>
  activeBanner.value?.banner.up5 ? item(activeBanner.value.banner.up5) : undefined,
)
const controlsLocked = computed(
  () => busy.value || revealLocked.value || selectionOpen.value || !!resetScope.value,
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
  <div class="warp-page" :inert="revealLocked">
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
    <WarpResults
      :entries="displayedEntries"
      :presentation="presentation"
      :source-label="displayedEntries.length ? sourceLabel(displayedEntries[0].event.bannerId) : ''"
      @details="showDetails($event, 'result')"
    />
    <div class="warp-actionbar">
      <p id="warp-choice-status" class="warp-action-status">
        {{
          !activeBanner
            ? t('warp.noBanners')
            : selectionIssue
              ? t(`warp.selection.${selectionIssue}`)
              : ''
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
          id="warp-pull-one"
          :label="t('warp.pullOne')"
          severity="secondary"
          outlined
          :disabled="!canPull || revealLocked"
          :aria-describedby="diagnostic ? 'warp-draw-error' : 'warp-choice-status'"
          @click="draw(1)"
          ><template #icon><Ticket :size="17" aria-hidden="true" /></template
        ></Button>
        <Button
          id="warp-pull-ten"
          :label="t('warp.pullTen')"
          :disabled="!canPull || revealLocked"
          :aria-describedby="diagnostic ? 'warp-draw-error' : 'warp-choice-status'"
          @click="draw(10)"
          ><template #icon><TicketsIcon :size="17" aria-hidden="true" /></template
        ></Button>
      </div>
      <p v-if="diagnostic" id="warp-draw-error" class="warp-error" role="alert">
        {{ t(`warp.error.${diagnostic.code}`) }}
      </p>
      <p v-if="storageNotice" class="warp-storage-notice" role="status">
        {{ t(`warp.storage.${storageNotice}`) }}
      </p>
    </div>
    <Drawer
      block-scroll
      id="warp-controls-drawer"
      :visible="panel === 'controls'"
      position="left"
      :header="t('warp.panels.controls')"
      :style="{
        width: '25rem',
        maxWidth: '100vw',
        '--warp-controls-inset': 'clamp(16px, 4vw, 20px)',
      }"
      :pt="{
        header: { style: { padding: 'var(--warp-controls-inset)' } },
        content: { style: { padding: '0 var(--warp-controls-inset) var(--warp-controls-inset)' } },
      }"
      :close-button-props="{ 'aria-label': t('warp.panels.closeControls') }"
      @update:visible="
        (value) => {
          if (!value) overlay.closePanel()
        }
      "
      @after-hide="afterPanelHide"
      @after-show="afterPanelShow"
    >
      <section class="warp-controls" :aria-label="t('warp.panels.controls')">
        <Tabs
          v-if="simulator.bannerGroups.length"
          :value="activeKind ?? ''"
          scrollable
          :dt="{
            tablist: { background: 'transparent' },
            tabpanel: { background: 'transparent', padding: '0' },
            navButton: { background: 'var(--p-drawer-background)' },
          }"
          @update:value="simulator.selectKind($event as WarpBannerKind)"
        >
          <TabList
            :pt="{
              tabList: { 'aria-label': t('warp.bannerKind') },
              prevButton: { 'aria-label': t('warp.previousKinds') },
              nextButton: { 'aria-label': t('warp.nextKinds') },
            }"
          >
            <Tab
              v-for="group in simulator.bannerGroups"
              :key="group.kind"
              :value="group.kind"
              :disabled="controlsLocked"
            >
              {{ t(`warp.kind.${group.kind}`) }}
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel v-for="group in simulator.bannerGroups" :key="group.kind" :value="group.kind">
              <template v-if="activeBanner && group.kind === activeKind">
                <Select
                  input-id="warp-banner"
                  :aria-label="t('warp.bannerSelect')"
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
                <div v-if="upItem" class="warp-banner-featured">
                  <span class="warp-banner-portrait"><WarpItemVisual :item="upItem" /></span>
                  <div class="warp-banner-identity">
                    <h3>{{ upItem.name }}</h3>
                    <span class="warp-featured-label">{{ t('warp.fiveUp') }}</span>
                  </div>
                </div>
                <p v-else class="warp-ordinary-info">{{ t('warp.ordinaryInfo') }}</p>
                <p v-if="activeBanner.banner.up4?.length" class="warp-featured-label">
                  {{ t('warp.fourUpTitle') }}
                </p>
                <ul
                  v-if="activeBanner.banner.up4?.length"
                  class="warp-four-up"
                  :aria-label="t('warp.fourUpTitle')"
                >
                  <li v-for="id in activeBanner.banner.up4" :key="id">
                    <span
                      v-tooltip.top="item(id).name"
                      role="img"
                      tabindex="0"
                      class="warp-four-up-item"
                      :aria-label="t('warp.upItem', { name: item(id).name })"
                    >
                      <span class="warp-four-up-portrait" aria-hidden="true"
                        ><WarpItemVisual :item="item(id)"
                      /></span>
                      <span class="warp-four-up-name" aria-hidden="true">{{ item(id).name }}</span>
                    </span>
                  </li>
                </ul>
                <WarpPityPanel
                  v-if="pity"
                  :pity="pity"
                  :has-up5="!!activeBanner.banner.up5"
                  :has-up4="!!activeBanner.banner.up4?.length"
                />
                <div v-if="activeBanner.requiresSelection" class="warp-affinity">
                  <div class="warp-section-heading">
                    <h3>{{ t('warp.selection.title') }}</h3>
                    <Badge
                      :value="t('warp.selection.count', { count: selectedAvatarIds.length })"
                      :severity="selectedAvatarIds.length === 7 ? 'success' : 'secondary'"
                    />
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
                    :label="
                      t(selectedAvatarIds.length ? 'warp.selection.edit' : 'warp.selection.choose')
                    "
                    severity="secondary"
                    outlined
                    :disabled="controlsLocked"
                    aria-describedby="warp-choice-status"
                    id="warp-selection-trigger"
                    @click="openSelection('warp-selection-trigger')"
                    ><template #icon><UsersRound :size="16" aria-hidden="true" /></template
                  ></Button>
                  <p v-if="selectionIssue" class="warp-muted">
                    {{ t(`warp.selection.${selectionIssue}`) }}
                  </p>
                </div>
              </template>
            </TabPanel>
          </TabPanels>
        </Tabs>
        <p v-else class="warp-muted">{{ t('warp.noBanners') }}</p>
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
    <WarpRevealOverlay
      :visible="revealVisible"
      :entry="revealEntry"
      :item="revealEntry ? item(revealEntry.event.itemId) : undefined"
      :phase="revealPhase"
      :artwork-ready="artworkReady"
      :identity-ready="identityReady"
      @artwork-ready="reveal.markArtworkReady"
      @identity-ready="reveal.markIdentityReady"
      @activate="reveal.activate"
      @escape="reveal.escape"
      @after-hide="afterRevealHide"
    />
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
.warp-banner-select {
  width: 100%;
  min-width: 0;
  margin-top: 12px;
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
.warp-featured-label {
  font-size: 12px;
  color: var(--color-muted);
}
.warp-four-up {
  display: flex;
  gap: 16px;
  list-style: none;
  padding: 0;
  margin: 0 0 18px;
}
.warp-four-up li {
  min-width: 0;
  width: 72px;
}
.warp-four-up-item {
  display: grid;
  justify-items: center;
  gap: 6px;
  border-radius: 6px;
}
.warp-four-up-item:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
.warp-four-up-portrait {
  width: 52px;
  height: 52px;
}
.warp-four-up-name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 11px;
  color: var(--color-muted);
}
.warp-ordinary-info {
  margin: 20px 0;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.6;
}
.warp-storage-notice {
  flex-basis: 100%;
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
}
.warp-controls :deep(.p-tab) {
  white-space: nowrap;
  font-size: 12px;
  padding: 12px;
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
  margin: 16px 0 0;
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
  .warp-page-heading {
    margin-bottom: 16px;
  }
  .warp-panel-actions {
    width: 100%;
  }
}
@media (max-width: 400px) {
  .warp-actions {
    width: 100%;
  }
  .warp-actions > * {
    flex: 1;
  }
}
</style>
