<script setup lang="ts">
import { ref, watch } from 'vue'
import { Timer, UserRound, Swords, Gauge } from '@lucide/vue'
const props = defineProps<{
  src?: string
  name: string
  event?: boolean
  enemy?: boolean
  aha?: boolean
}>()
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>
<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="name"
    class="game-icon"
    width="48"
    height="48"
    @error="failed = true"
  /><span v-else class="event-avatar" role="img" :aria-label="name"
    ><component
      :is="aha ? Gauge : event ? Timer : enemy ? Swords : UserRound"
      :size="22"
      :stroke-width="1.75"
  /></span>
</template>
