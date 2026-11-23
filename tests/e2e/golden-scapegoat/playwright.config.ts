import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const servers = [
  { name: 'dev', script: 'dev', port: 4187 },
  { name: 'production-preview', script: 'preview', port: 4188 },
]
const origin = (port: number) => `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: '.',
  outputDir: '../../../test-results/golden-scapegoat',
  // The copy checks share the browser's system clipboard.
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    browserName: 'chromium',
    channel: process.env.GOLDEN_SCAPEGOAT_BROWSER_CHANNEL || undefined,
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: servers.map(({ name, port }) => ({ name, use: { baseURL: origin(port) } })),
  webServer: servers.map(({ script, port }) => ({
    command: `npm run ${script} -- --port ${port} --strictPort`,
    cwd: repo,
    url: `${origin(port)}/golden-scapegoat`,
    timeout: 60_000,
  })),
})
