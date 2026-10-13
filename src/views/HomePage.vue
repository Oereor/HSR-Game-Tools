<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
<template>
  <p class="eyebrow">{{ t('site.phase') }}</p>
  <h1>{{ t('home.title') }}</h1>
  <p class="muted max-w-xl">{{ t('home.description') }}</p>
  <RouterLink to="/action-planner" class="primary-link">{{ t('home.open') }} →</RouterLink>
</template>
