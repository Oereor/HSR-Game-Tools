import { computed, onScopeDispose, readonly, ref, shallowRef, watch, type Ref } from 'vue'
import type { HistoryEntry } from './useWarpSimulator'

export type RevealPhase = 'idle' | 'intro' | 'stars' | 'artwork' | 'waiting' | 'leaving'
export const REVEAL_TIMING = { fade: 400, hold: 300, prelude: 1100 } as const

/** Presentation gate over committed records. Never owns or mutates an engine session. */
export function useWarpReveal(reducedMotion: Readonly<Ref<boolean>>) {
  const phase = ref<RevealPhase>('idle')
  const visible = ref(false)
  const pending = shallowRef<{ id: number; entries: readonly HistoryEntry[] }>()
  const queue = shallowRef<readonly HistoryEntry[]>([])
  const cursor = ref(0)
  const displayedEntries = shallowRef<readonly HistoryEntry[]>([])
  const current = computed(() => queue.value[cursor.value])
  const locked = computed(() => !!pending.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  let revision = 0
  let lastBatchId = 0
  let disposed = false

  function clearTimer() {
    revision++
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  function later(callback: () => void, delay: number) {
    const token = revision
    timer = setTimeout(() => {
      timer = undefined
      if (!disposed && token === revision) callback()
    }, delay)
  }
  function enter(next: RevealPhase) {
    clearTimer()
    phase.value = next
    if (next === 'intro') later(() => enter('stars'), REVEAL_TIMING.prelude)
    else if (next === 'stars') later(() => enter('artwork'), REVEAL_TIMING.prelude)
    else if (next === 'artwork') later(() => enter('waiting'), REVEAL_TIMING.fade)
  }
  function showCurrent() {
    enter(reducedMotion.value ? 'waiting' : current.value?.event.rarity === 5 ? 'intro' : 'artwork')
  }
  function finishLeaving() {
    clearTimer()
    if (cursor.value + 1 < queue.value.length) {
      cursor.value++
      showCurrent()
    } else visible.value = false
  }
  function advance() {
    if (!visible.value || phase.value === 'leaving') return
    enter('leaving')
    if (reducedMotion.value) finishLeaving()
    else later(finishLeaving, REVEAL_TIMING.fade)
  }
  function activate() {
    if (!visible.value) return
    if (phase.value === 'intro' || phase.value === 'stars') enter('artwork')
    else if (phase.value === 'waiting') advance()
  }
  function reset() {
    clearTimer()
    visible.value = false
    pending.value = undefined
    queue.value = []
    cursor.value = 0
    phase.value = 'idle'
    displayedEntries.value = []
  }
  function beginBatch(batchId: number, entries: readonly HistoryEntry[]) {
    if (
      disposed ||
      batchId <= lastBatchId ||
      !entries.length ||
      entries.some((entry) => entry.batchId !== batchId)
    )
      return false
    clearTimer()
    lastBatchId = batchId
    const batchEntries = Object.freeze([...entries])
    queue.value =
      batchEntries.length === 1
        ? batchEntries
        : batchEntries.filter((entry) => entry.event.rarity === 5)
    cursor.value = 0
    if (!queue.value.length) {
      pending.value = undefined
      visible.value = false
      phase.value = 'idle'
      displayedEntries.value = batchEntries
    } else {
      pending.value = { id: batchId, entries: batchEntries }
      visible.value = true
      showCurrent()
    }
    return true
  }
  function afterHide() {
    // A stale Dialog leave hook must not release a replacement batch.
    if (visible.value || phase.value !== 'leaving' || !pending.value) return false
    clearTimer()
    displayedEntries.value = pending.value.entries
    pending.value = undefined
    queue.value = []
    phase.value = 'idle'
    return true
  }
  watch(
    reducedMotion,
    (enabled) => {
      if (!enabled || !visible.value) return
      if (phase.value === 'leaving') finishLeaving()
      else enter('waiting')
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    reset()
  })

  return {
    phase: readonly(phase),
    visible: readonly(visible),
    locked,
    current,
    batchId: computed(() => pending.value?.id),
    displayedEntries: readonly(displayedEntries),
    beginBatch,
    activate,
    escape: advance,
    afterHide,
    reset,
  }
}
