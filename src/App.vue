<script setup lang="ts">
import { watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
const { t, locale } = useI18n()
const route = useRoute()
watchEffect(() => {
  document.documentElement.lang = locale.value
  document.title = t(String(route.meta.title ?? 'site.name')) + ' · HSR-Game-Tools'
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('home.description'))
})
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink to="/" class="brand">HSR-Game-Tools</RouterLink>
      <div class="language-control" :aria-label="t('site.language')">
        <button type="button" :aria-pressed="locale === 'zh-CN'" @click="locale = 'zh-CN'">
          简体中文
        </button>
        <button type="button" :aria-pressed="locale === 'en'" @click="locale = 'en'">
          English
        </button>
      </div>
    </header>
    <main><RouterView /></main>
  </div>
</template>
