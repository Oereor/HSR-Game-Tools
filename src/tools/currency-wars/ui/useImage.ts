import { computed, ref } from 'vue'

export function useCurrencyImage(url: () => string | undefined) {
  const failed = ref<string>()
  const source = computed(() => (url() !== failed.value ? url() : undefined))
  function fail() {
    failed.value = url()
  }
  return { source, fail }
}
