import { computed, ref } from 'vue'

/** A failed URL stays on its neutral fallback; a different mapped URL can load normally. */
export function useWarpPortrait(url: () => string | undefined) {
  const failedUrl = ref<string>()
  const source = computed(() => (url() !== failedUrl.value ? url() : undefined))
  function fail() {
    failedUrl.value = url()
  }
  return { source, fail }
}
