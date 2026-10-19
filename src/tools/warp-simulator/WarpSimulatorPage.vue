<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
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
  Plus,
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
import WarpBannerList from './components/WarpBannerList.vue'
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
const controlsLocked = computed(
  () => busy.value || revealLocked.value || selectionOpen.value || !!resetScope.value,
)
function focus(id: string | undefined) {
  if (!id) return
  void nextTick(() => {
    const target = document.getElementById(id)
    const fallback = id.startsWith('warp-affinity-')
      ? document.querySelector<HTMLButtonElement>('.warp-affinity button:not(:disabled)')
      : undefined
    const focusTarget = target ?? fallback
    focusTarget?.focus()
  })
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
        content: {
          style: {
            padding: '0 var(--warp-controls-inset)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '0',
            overflow: 'hidden',
          },
        },
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
          class="warp-control-tabs"
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
            class="warp-control-tablist"
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
          <TabPanels class="warp-control-panels">
            <TabPanel
              v-for="group in simulator.bannerGroups"
              :key="group.kind"
              :value="group.kind"
              class="warp-control-panel"
            >
              <div v-if="group.kind === activeKind" class="warp-banner-scroll">
                <WarpBannerList
                  :banners="simulator.kindBanners.value"
                  :selected-banner-id="selectedBannerId"
                  :disabled="controlsLocked"
                  :presentation="presentation"
                  @select="simulator.selectBanner"
                />
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
        <p v-else class="warp-no-banners">{{ t('warp.noBanners') }}</p>
        <div class="warp-control-footer">
          <WarpPityPanel
            v-if="pity && activeBanner"
            :pity="pity"
            :has-up5="!!activeBanner.banner.up5"
            :has-up4="!!activeBanner.banner.up4?.length"
          />
          <div v-if="activeBanner?.requiresSelection" class="warp-affinity">
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
              <li v-for="id in selectedAvatarIds" :key="id">
                <Button
                  :id="`warp-affinity-${id}`"
                  v-tooltip.top="item(id).name"
                  unstyled
                  type="button"
                  class="warp-affinity-avatar"
                  :aria-label="t('warp.selection.editCharacter', { name: item(id).name })"
                  aria-haspopup="dialog"
                  :disabled="controlsLocked"
                  :aria-describedby="selectionIssue ? 'warp-affinity-status' : undefined"
                  @click="openSelection(`warp-affinity-${id}`)"
                  ><span aria-hidden="true"><WarpItemVisual :item="item(id)" /></span
                ></Button>
              </li>
            </ul>
            <Button
              v-else
              id="warp-affinity-empty"
              unstyled
              type="button"
              class="warp-affinity-empty"
              :aria-label="t('warp.selection.choose')"
              aria-haspopup="dialog"
              :disabled="controlsLocked"
              :aria-describedby="selectionIssue ? 'warp-affinity-status' : undefined"
              @click="openSelection('warp-affinity-empty')"
              ><Plus :size="32" :stroke-width="1.5" aria-hidden="true"
            /></Button>
            <p v-if="selectionIssue" id="warp-affinity-status" class="warp-muted" role="status">
              {{ t(`warp.selection.${selectionIssue}`) }}
            </p>
          </div>
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
        </div>
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
  padding-top: 12px;
}
.warp-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.warp-section-heading h3 {
  margin: 0;
  font-size: 14px;
}
.warp-selected-avatars {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.warp-selected-avatars li {
  min-width: 0;
}
.warp-affinity-avatar {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--color-line);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.warp-affinity-avatar > span {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}
.warp-affinity-empty {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 64px;
  border: 1px dashed var(--color-line);
  border-radius: 6px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
}
.warp-affinity-empty > svg {
  opacity: 0.6;
}
.warp-affinity-avatar:focus-visible,
.warp-affinity-empty:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.warp-affinity-avatar:disabled,
.warp-affinity-empty:disabled {
  opacity: 0.6;
  cursor: default;
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
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.warp-control-tabs,
.warp-control-panels {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.warp-control-tablist {
  flex-shrink: 0;
}
/* TabPanel has a fragment root, so its DOM node does not inherit this SFC's scope ID. */
.warp-controls :deep(.warp-control-panel) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.warp-banner-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.warp-control-footer {
  flex-shrink: 0;
  max-height: 65%;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-top: 1px solid var(--color-line);
  padding: 0 3px calc(var(--warp-controls-inset) + env(safe-area-inset-bottom));
}
.warp-control-footer :deep(.warp-pity) {
  border-top: 0;
}
.warp-no-banners {
  flex: 1;
  color: var(--color-muted);
  font-size: 12px;
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
