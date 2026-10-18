import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/unit/warp-simulator/reveal-identity-render.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [vue()],
        test: {
          name: 'identity-render',
          include: ['tests/unit/warp-simulator/reveal-identity-render.test.ts'],
          environment: './tests/fixtures/warp-simulator/node-render-environment.ts',
        },
      },
    ],
  },
})
