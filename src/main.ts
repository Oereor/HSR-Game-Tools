import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { i18n } from './locales'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import { ToolsPreset } from './theme/preset'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/noto-sans-sc/wght.css'
import './assets/main.css'
document.documentElement.classList.add('app-dark')
createApp(App)
  .use(PrimeVue, {
    theme: {
      preset: ToolsPreset,
      options: {
        darkModeSelector: '.app-dark',
        cssLayer: { name: 'primevue', order: 'theme, base, primevue, components, utilities' },
      },
    },
  })
  .directive('tooltip', Tooltip)
  .use(router)
  .use(i18n)
  .mount('#app')
