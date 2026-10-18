import { computed, shallowRef, watch } from 'vue'
import type { ImagePresentation } from '../model/presentation'

/** Ordered image fallback; no requests, timers or business state live here. */
export function useWarpRevealSource(
  preferred: () => ImagePresentation | undefined,
  fallback: () => string | undefined,
) {
  const failed = shallowRef<ReadonlySet<string>>(new Set())
  const loaded = shallowRef<{ url: string; width: number; height: number }>()
  const source = computed(() =>
    [preferred()?.url, fallback()].find((url) => url && !failed.value.has(url)),
  )
  const dimensions = computed(() =>
    loaded.value?.url === source.value
      ? loaded.value
      : preferred()?.url === source.value
        ? preferred()
        : undefined,
  )
  const ready = computed(() => !source.value || loaded.value?.url === source.value)
  watch(
    () => [preferred()?.url, preferred()?.width, preferred()?.height, fallback()].join('\0'),
    () => {
      failed.value = new Set()
      loaded.value = undefined
    },
    { flush: 'sync' },
  )
  function fail(url: string) {
    if (url !== source.value) return
    failed.value = new Set([...failed.value, url])
  }
  function load(url: string, width: number, height: number) {
    if (url !== source.value || width <= 0 || height <= 0) return
    loaded.value = { url, width, height }
  }
  return { source, dimensions, ready, fail, load }
}

export function revealPixelLimit(width: number, height: number, pixelRatio: number) {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  return { maxWidth: `${width / ratio}px`, maxHeight: `${height / ratio}px` }
}
