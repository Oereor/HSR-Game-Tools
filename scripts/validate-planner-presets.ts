import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { validatePresets } from '../src/tools/action-planner/presets/validation'
import game from '../src/tools/action-planner/data/game/catalog.json'
import zh from '../src/locales/zh-CN.json'
import en from '../src/locales/en.json'
import type { GameSnapshot } from '../src/tools/action-planner/data/schema'

const directory = new URL('../src/tools/action-planner/presets/definitions/', import.meta.url)
const definitions: unknown[] = []
for (const file of (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()) {
  const path = new URL(file, directory)
  try {
    definitions.push(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    throw new Error(`Invalid preset: ${fileURLToPath(path)}`, { cause: error })
  }
}
validatePresets(definitions, [zh, en], game as GameSnapshot)
console.log(`Planner presets: ${definitions.length} definitions validated.`)
