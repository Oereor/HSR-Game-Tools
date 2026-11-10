import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    // Keep every font subset fetchable on demand, including those below Vite's inline limit.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
  },
  worker: { format: 'es' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
