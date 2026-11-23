import { readFile } from 'node:fs/promises'
import { expect, test as base, type Locator, type Page } from '@playwright/test'
import sample5 from '../../../src/tools/golden-scapegoat/sample5.json' with { type: 'json' }

const workerEntry = /\/search\.worker(?:\.ts\?|-[^/]+\.js(?:$|\?))/
const localResource = /\/(?:favicon\.ico|_vercel\/insights\/script\.js)$/
const test = base.extend<{ checkBrowserErrors: void }>({
  checkBrowserErrors: [
    async ({ page }, use) => {
      const errors = new Set<string>()
      page.on('pageerror', (error) => errors.add(error.stack ?? error.message))
      page.on('console', (message) => {
        if (message.type() === 'error' && !localResource.test(message.location().url)) {
          errors.add(message.text())
        }
      })
      page.on('requestfailed', (request) => {
        if (workerEntry.test(request.url())) {
          errors.add(`${request.failure()?.errorText} ${request.url()}`)
        }
      })
      page.on('response', (response) => {
        if (workerEntry.test(response.url()) && response.status() >= 400) {
          errors.add(`HTTP ${response.status()} ${response.url()}`)
        }
      })
      // Chromium reports ResizeObserver delivery errors on Window.
      await page.addInitScript(() => {
        window.addEventListener('error', (event) => {
          if (event.message) console.error(event.message)
        })
      })
      await use()
      expect([...errors], 'browser and Worker errors').toEqual([])
    },
    { auto: true },
  ],
})

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const kInput = (page: Page) => page.getByRole('spinbutton', { name: '记录步数 K' })
const sequence = (page: Page) => page.getByRole('region', { name: '操作序列' })
const stepCard = (page: Page, n: number) =>
  sequence(page).getByRole('button', { name: new RegExp(`^第 ${n} 步 ·`) })
const cell = (page: Page, x: number, y: number) =>
  page.getByRole('button', { name: new RegExp(`^\\(${x}, ${y}\\)`) })
const currentStep = (page: Page, current: number, total: number) =>
  expect(page.getByText(`第 ${current} / ${total} 步`, { exact: true })).toBeVisible()

test.beforeEach(async ({ page }) => {
  await page.goto('/golden-scapegoat')
  await expect(page.getByRole('heading', { name: '黄金替罪羊求解器' })).toBeVisible()
})

async function expectBlank(page: Page) {
  await expect(tab(page, '编辑地图')).toHaveAttribute('aria-selected', 'true')
  await expect(tab(page, '解法回放')).toBeDisabled()
  await expect(kInput(page)).toHaveValue('')
  await expect(button(page, '开始求解')).toBeDisabled()
  const board = page.getByRole('group', { name: '关卡地图' })
  await expect(board.getByRole('button', { name: / · / })).toHaveCount(0)
}

async function drawMap(page: Page, shape: 'straight' | 'ladder') {
  const start: [number, number] = shape === 'straight' ? [0, 0] : [0, 2]
  const goal: [number, number] = shape === 'straight' ? [2, 0] : [0, 0]
  await button(page, '固定平台').click()
  await cell(page, ...start).click()
  if (shape === 'straight') await cell(page, 1, 0).click()
  await cell(page, ...goal).click()
  await button(page, '起点 S').click()
  await cell(page, ...start).click()
  await button(page, '终点 G').click()
  await cell(page, ...goal).click()
  if (shape === 'ladder') {
    await button(page, '梯子').click()
    await cell(page, ...goal).click()
    await cell(page, ...start).click()
  }
  await kInput(page).fill('1')
  await kInput(page).press('Tab')
}

async function solve(page: Page, steps: number) {
  const [worker] = await Promise.all([
    page.waitForEvent('worker', { predicate: (worker) => workerEntry.test(worker.url()) }),
    button(page, '开始求解').click(),
  ])
  expect(worker.url()).toMatch(workerEntry)
  await expect(tab(page, '解法回放')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: `最短解 · ${steps} 步` })).toBeVisible()
  await currentStep(page, 0, steps)
  await expect(page.getByText(/求解服务运行失败/)).toHaveCount(0)
}

async function downloadMap(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    button(page, '导出').click(),
  ])
  expect(download.suggestedFilename()).toBe('golden-scapegoat.json')
  return readFile(await download.path())
}

async function importMap(page: Page, buffer: Buffer) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    button(page, '导入').click(),
  ])
  await chooser.setFiles({ name: 'golden-scapegoat.json', mimeType: 'application/json', buffer })
}

async function bounds(locator: Locator) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  if (!box) throw new Error('Visible element has no layout box')
  return box
}

async function expectStepLayout(page: Page) {
  const first = stepCard(page, 1)
  const dual = stepCard(page, 5)
  const firstBox = await bounds(first)
  const dualBox = await bounds(dual)
  const number = await bounds(first.getByText('1', { exact: true }))
  expect(firstBox.height).toBe(dualBox.height)
  expect(number.x - firstBox.x).toBeLessThan(10)
  expect(number.y - firstBox.y).toBeLessThan(10)
  await expect(first.locator('svg')).toHaveCount(1)
  const top = await bounds(first.locator('svg'))
  const bottom = await bounds(dual.locator('svg').last())
  expect(Math.abs(top.x + top.width / 2 - (firstBox.x + firstBox.width / 2))).toBeLessThan(2)
  expect(Math.abs(top.y + top.height / 2 - (firstBox.y + firstBox.height / 4))).toBeLessThan(2)
  expect(Math.abs(bottom.x + bottom.width / 2 - (dualBox.x + dualBox.width / 2))).toBeLessThan(2)
  expect(
    Math.abs(bottom.y + bottom.height / 2 - (dualBox.y + (3 * dualBox.height) / 4)),
  ).toBeLessThan(2)
}

test('solves a new three-platform map on the first click', async ({ page }) => {
  await button(page, '新建地图').click()
  await expectBlank(page)
  await drawMap(page, 'straight')
  await solve(page, 2)
  await button(page, '最后一帧').click()
  await expect(page.getByRole('img', { name: /\(2, 0\).*终点 G.*金羊/ })).toBeVisible()
})

test('solves a newly drawn ladder on the first click', async ({ page }) => {
  await button(page, '新建地图').click()
  await expectBlank(page)
  await drawMap(page, 'ladder')
  await solve(page, 1)
  await button(page, '下一步').click()
  await currentStep(page, 1, 1)
  await expect(page.getByRole('img', { name: /\(0, 0\).*终点 G.*金羊/ })).toBeVisible()
})

test('loads the demo, replays its solution and copies both formats', async ({ page }) => {
  await button(page, '载入演示地图').click()
  await expect(kInput(page)).toHaveValue('4')
  await expect(cell(page, 4, 4)).toHaveAccessibleName(/开启.*机关/)
  await expect(cell(page, 10, 0)).toHaveAccessibleName(/开启/)
  await expect(cell(page, 5, 4)).toHaveAccessibleName(/梯子.*机关/)
  await expect(cell(page, 6, 4)).toHaveAccessibleName(/活动平台.*按下机关时存在/)
  expect(JSON.parse((await downloadMap(page)).toString())).toEqual(sample5)
  await solve(page, 10)
  await expect(sequence(page).getByRole('button')).toHaveCount(10)
  await expectStepLayout(page)

  await stepCard(page, 3).click()
  await expect(stepCard(page, 3)).toHaveAttribute('aria-current', 'step')
  await button(page, '下一步').click()
  await currentStep(page, 4, 10)
  await expect(page.getByRole('img', { name: /\(10, 0\).*金羊/ })).toBeVisible()
  await button(page, '下一步').click()
  await expect(stepCard(page, 5)).toHaveAccessibleName(/金羊向左.*黑羊向右/)
  await currentStep(page, 5, 10)
  await button(page, '上一步').click()
  await currentStep(page, 4, 10)
  await button(page, '起始帧').click()
  await currentStep(page, 0, 10)
  await button(page, '最后一帧').click()
  await currentStep(page, 10, 10)
  await expect(page.getByRole('img', { name: /\(5, 1\).*终点 G.*金羊/ })).toBeVisible()
  await expect(page.getByText('本步事件', { exact: true })).toHaveCount(0)

  await button(page, '复制方向箭头').click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('→ → → → ← ← ← ← ← ↑')
  await button(page, '复制 WASD').click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('DDDDAAAAAW')

  await page.setViewportSize({ width: 1024, height: 900 })
  const divider = page.getByRole('separator', { name: '调整面板宽度' })
  const gutter = await bounds(divider)
  const x = gutter.x + gutter.width / 2
  const y = gutter.y + gutter.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 60, y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await bounds(divider)).x).toBeLessThan(gutter.x - 20)
  await expectStepLayout(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(divider).toHaveCount(0)
  await expectStepLayout(page)
  const replayMap = page.getByRole('tabpanel').getByRole('region', { name: '关卡地图' })
  expect((await bounds(replayMap)).y).toBeLessThan((await bounds(sequence(page))).y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('clears the current map and replay before solving a new map', async ({ page }) => {
  await button(page, '载入演示地图').click()
  await solve(page, 10)
  await button(page, '最后一帧').click()
  await button(page, '新建地图').click()
  await expectBlank(page)
  await expect(sequence(page)).toHaveCount(0)
  expect(JSON.parse((await downloadMap(page)).toString())).toEqual({
    version: 2,
    k: null,
    start: null,
    goal: null,
    floors: [],
    platformGroups: [],
    ladders: [],
    portalPairs: [],
  })
  await drawMap(page, 'straight')
  await solve(page, 2)
})

test('imports the exported demo with all geometry and solves it again', async ({ page }) => {
  await button(page, '载入演示地图').click()
  const original = await downloadMap(page)
  await button(page, '新建地图').click()
  await expectBlank(page)
  await importMap(page, original)
  await expect(kInput(page)).toHaveValue('4')
  expect(JSON.parse((await downloadMap(page)).toString())).toEqual(sample5)
  await solve(page, 10)
  await stepCard(page, 5).click()
  await importMap(page, Buffer.from('{'))
  await expect(page.getByRole('alert')).toContainText('无法读取有效的 JSON')
  await currentStep(page, 5, 10)
  await button(page, '关闭提示').click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('paginates a long solution and keeps its selected card reachable on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const at = (x: number) => ({ x, y: x })
  await importMap(
    page,
    Buffer.from(
      JSON.stringify({
        version: 2,
        k: 100,
        start: at(0),
        goal: at(65),
        floors: Array.from({ length: 66 }, (_, index) => at(index)),
        platformGroups: [],
        ladders: [],
        portalPairs: [],
      }),
    ),
  )
  await solve(page, 65)
  await expect(page.getByText('第 1 / 2 页', { exact: true })).toBeVisible()
  await button(page, '下一页操作').click()
  await expect(sequence(page).getByRole('listitem')).toHaveCount(5)
  await stepCard(page, 65).click()
  await currentStep(page, 65, 65)
  await expect(stepCard(page, 65)).toHaveAttribute('aria-current', 'step')
  await button(page, '上一页操作').click()
  await expect(sequence(page).getByRole('listitem')).toHaveCount(60)
  await button(page, '上一步').click()
  await expect(stepCard(page, 64)).toHaveAttribute('aria-current', 'step')
})
