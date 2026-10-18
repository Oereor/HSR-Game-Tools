<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import { REVEAL_TIMING, type RevealPhase } from '../composables/useWarpReveal'
import type { ItemPresentation } from '../model/presentation'
import WarpRevealImage from './WarpRevealImage.vue'
import WarpRevealIdentity from './WarpRevealIdentity.vue'
import WarpRevealMetadata from './WarpRevealMetadata.vue'
import { showRevealMetadata } from './reveal-metadata'
import { useWarpPixelRatio } from '../composables/useWarpPixelRatio'

const props = defineProps<{
  visible: boolean
  entry?: HistoryEntry
  item?: ItemPresentation
  phase: RevealPhase
  artworkReady: boolean
  identityReady: boolean
}>()
const emit = defineEmits<{
  activate: []
  escape: []
  'after-hide': []
  'artwork-ready': [batchId: number, entryId: number]
  'identity-ready': [batchId: number, entryId: number]
}>()
const { t } = useI18n()
const pixelRatio = useWarpPixelRatio()
const screen = ref<{ $el: HTMLButtonElement }>()
// Keep the outgoing stage mounted during its exit, without replaying entrance CSS.
const leavingStage = ref<RevealPhase>('artwork')
watch(
  () => props.phase,
  (next, previous) => {
    if (next === 'leaving') leavingStage.value = previous
  },
  { flush: 'sync' },
)
const stage = computed(() => (props.phase === 'leaving' ? leavingStage.value : props.phase))
const metadataVisible = computed(() => showRevealMetadata(stage.value, props.artworkReady))
const metadataDescriptionId = computed(
  () => `warp-reveal-metadata-${props.entry?.batchId}-${props.entry?.id}`,
)
const hint = computed(() =>
  t(
    props.phase === 'artwork' && !props.artworkReady
      ? 'warp.reveal.loading'
      : props.phase === 'waiting'
        ? 'warp.reveal.continue'
        : 'warp.reveal.skip',
  ),
)
function focusScreen() {
  void nextTick(() => screen.value?.$el.focus({ preventScroll: true }))
}
function keydown(event: KeyboardEvent) {
  if (event.repeat && ['Escape', 'Enter', ' '].includes(event.key)) event.preventDefault()
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) emit('escape')
  }
}
</script>

<template>
  <Dialog
    unstyled
    modal
    block-scroll
    append-to="body"
    :visible="visible"
    :draggable="false"
    :closable="false"
    :close-on-escape="false"
    :dismissable-mask="false"
    :show-header="false"
    :aria-label="t('warp.reveal.title', { name: item?.name ?? t('warp.visual.unknown') })"
    :pt="{
      mask: { class: 'warp-reveal-mask' },
      root: { class: 'warp-reveal-dialog', 'aria-labelledby': undefined },
      transition: { css: false },
    }"
    @show="focusScreen"
    @after-hide="emit('after-hide')"
  >
    <template #container>
      <Button
        ref="screen"
        unstyled
        type="button"
        class="warp-reveal-screen"
        :class="{ 'warp-reveal-leaving': phase === 'leaving' }"
        :style="{
          '--reveal-fade': `${REVEAL_TIMING.fade}ms`,
        }"
        :aria-label="
          t('warp.reveal.action', { name: item?.name ?? t('warp.visual.unknown'), action: hint })
        "
        :aria-describedby="metadataVisible && entry && item ? metadataDescriptionId : undefined"
        @click="emit('activate')"
        @keydown="keydown"
      >
        <span v-if="entry && item" :key="`${entry.batchId}:${entry.id}`" class="warp-reveal-stage">
          <WarpRevealIdentity
            v-if="stage === 'identity'"
            :item="item"
            :batch-id="entry.batchId"
            :entry-id="entry.id"
            :started="identityReady"
            :path-label="item.pathName ?? t('warp.visual.unknown')"
            :rarity-label="t('warp.visual.rarity', { count: entry.event.rarity })"
            @ready="(batchId, entryId) => emit('identity-ready', batchId, entryId)"
          />
          <span
            v-show="stage === 'artwork' || stage === 'waiting'"
            class="warp-reveal-artwork"
            :class="{ 'warp-reveal-artwork-enter': phase === 'artwork' && artworkReady }"
          >
            <WarpRevealImage
              :preferred="item.revealArtwork"
              :fallback-url="item.artworkUrl"
              :kind="item.kind"
              :label="item.name"
              :pixel-ratio="pixelRatio"
              :batch-id="entry.batchId"
              :entry-id="entry.id"
              @ready="(batchId, entryId) => emit('artwork-ready', batchId, entryId)"
            />
            <WarpRevealMetadata
              v-if="metadataVisible"
              :item="item"
              :rarity="entry.event.rarity"
              :description-id="metadataDescriptionId"
            />
          </span>
        </span>
        <span class="warp-reveal-hint" aria-hidden="true">{{ hint }}</span>
      </Button>
    </template>
  </Dialog>
</template>

<!-- Teleported Dialog wrappers have no scope attribute: target only these owned classes. -->
<style>
.warp-reveal-mask,
.warp-reveal-dialog {
  background: #000000;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.warp-reveal-dialog {
  width: 100%;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
}
</style>

<style scoped>
.warp-reveal-screen {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right))
    max(64px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
  border: 0;
  border-radius: 0;
  background: #000000;
  color: var(--color-ink);
}
.warp-reveal-screen:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -4px;
}
.warp-reveal-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.warp-reveal-artwork {
  position: absolute;
  inset: 0;
  margin-inline: auto;
  width: min(100%, 1200px);
  height: 100%;
  min-height: 0;
}
.warp-reveal-artwork-enter {
  animation: warp-reveal-in var(--reveal-fade) ease-out both;
}
.warp-reveal-leaving .warp-reveal-stage {
  animation: warp-reveal-out var(--reveal-fade) ease-in both;
}
.warp-reveal-hint {
  position: absolute;
  bottom: max(24px, env(safe-area-inset-bottom));
  inset-inline: 24px;
  color: var(--color-muted);
  font-size: 13px;
  text-align: center;
}
@keyframes warp-reveal-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes warp-reveal-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .warp-reveal-artwork-enter,
  .warp-reveal-leaving .warp-reveal-stage {
    animation: none;
  }
}
</style>
