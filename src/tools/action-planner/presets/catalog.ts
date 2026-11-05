import { gameData } from '../data/adapters/game-data'
import zh from '../../../locales/zh-CN.json'
import en from '../../../locales/en.json'
import { validatePresets } from './validation'
import type { PresetDefinition } from './types'

const files: unknown[] = Object.values(
  import.meta.glob('./definitions/*.json', { eager: true, import: 'default' }),
)
validatePresets(files, [zh, en], gameData)
export const presets: readonly PresetDefinition[] = [...files].sort(
  (a, b) => a.order - b.order || a.id.localeCompare(b.id),
)
export function presetIcon(preset: PresetDefinition): string | undefined {
  const icon = preset.icon
  return (
    icon &&
    ('assetKey' in icon
      ? icon.assetKey
      : gameData.characters.find((c) => c.id === icon.characterId)?.assetKey)
  )
}
