<script setup lang="ts">
import type { Sheep } from '../engine/step'

defineProps<{ sheep: Sheep }>()
</script>

<template>
  <svg viewBox="0 0 24 24" :class="sheep" aria-hidden="true" focusable="false">
    <path
      d="M6.8 7.8C4.6 6.7 2.6 7.2 2 8.5c.4 2 2.1 3.6 4.3 3.8.1 4.5 2.3 7.2 5.7 7.2s5.6-2.7 5.7-7.2c2.2-.2 3.9-1.8 4.3-3.8-.6-1.3-2.6-1.8-4.8-.7-.4-2.4-2.2-3.7-3.6-2.8a2.2 2.2 0 0 0-3.2 0c-1.4-.9-3.2.4-3.6 2.8Z"
      fill="var(--sheep-fill)"
      stroke="var(--sheep-line)"
      stroke-width="1.7"
      stroke-linejoin="round"
    />
    <path
      d="M9 12h.2m5.6 0h.2m-4.1 3.3 1.1.8 1.1-.8"
      fill="none"
      stroke="var(--sheep-face)"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.gold {
  --sheep-fill: var(--color-accent);
  --sheep-line: var(--color-accent);
  --sheep-face: var(--color-page);
}
.black {
  --sheep-fill: var(--color-page);
  --sheep-line: var(--color-ink);
  --sheep-face: var(--color-ink);
}
</style>
