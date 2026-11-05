import type { GameSnapshot } from '../../../src/tools/action-planner/data/schema'
import type {
  PresetDefinition,
  PresetOperation,
  Value,
} from '../../../src/tools/action-planner/presets/types'
import { emptyDocument } from '../../../src/tools/action-planner/model/document-file'

// Test-owned data: changes to production presets or translations cannot change these contracts.
export const messages = { test: { title: 'Test preset', event: 'Event {index}', label: 'Amount' } }
export const game: GameSnapshot = {
  schemaVersion: 1,
  gameVersion: 'test',
  presets: [],
  assets: {},
  characters: [
    {
      id: 'test-character',
      names: { 'zh-CN': 'Test character', en: 'Test character' },
      baseSpeed: 94,
      aliases: { 'zh-CN': { official: [], player: [] }, en: { official: [], player: [] } },
      form: { pathCode: 'test' },
    },
  ],
}
export const translate = (key: string, params?: Record<string, string | number>) =>
  key === 'test.event' ? `Event ${params?.index}` : key
export const start = { kind: 'start' } as const
export const target = (id: string) => ({ kind: 'participants' as const, participantIds: [id] })
export function fixture() {
  const document = emptyDocument()
  document.plan.actors = ['a', 'b'].map((id, position) => ({
    id,
    position,
    name: id,
    kind: 'actor',
    camp: 'ally',
    baseSpeed: 100,
    panelSpeed: 100,
  }))
  document.metadata.characterIds = { a: 'test-character' }
  document.plan.maxNodes = 30
  document.plan.maxAV = 600
  return document
}
export function definition(
  operations: PresetOperation[],
  options: Partial<PresetDefinition> = {},
): PresetDefinition {
  return {
    id: 'test-preset',
    order: 0,
    interaction: 'batch',
    i18n: { name: 'test.title', description: 'test.title' },
    operations,
    ...options,
  }
}
export const draftPreset = definition([{ type: 'advance', target: 'selected', percent: 35 }], {
  id: 'test-draft',
  interaction: 'draft',
})
export const returnPreset = definition(
  [
    { type: 'depart', target: 'self' },
    { type: 'immediatelyAct', target: 'allies', onEmpty: 'skip' },
    {
      type: 'spawnParticipant',
      participant: {
        kind: 'scheduledEvent',
        name: { type: 'user-input', id: 'timerName', value: 'Test clock' },
        speed: 50,
      },
      onTrigger: [
        { type: 'returnToField', target: 'self' },
        { type: 'immediatelyAct', target: 'self' },
      ],
    },
  ],
  { id: 'test-return', characterId: 'test-character', selfPresence: 'present' },
)
export const speedPreset = definition(
  [
    {
      type: 'addSpeedModifier',
      target: 'self',
      mode: 'flat',
      amount: 40,
      duration: { kind: 'countdown', name: 'Test buff', speed: 50 },
    },
    { type: 'advance', target: 'self', percent: 100 },
  ],
  { id: 'test-speed', characterId: 'test-character', selfPresence: 'present' },
)
const inheritedSpeed: Value = {
  type: 'multiply',
  left: { type: 'self-stat', stat: 'panelSpeed' },
  right: 1.8,
}
export const repeatPreset = definition(
  [
    { type: 'depart', target: 'self' },
    {
      type: 'spawnParticipant',
      participant: {
        kind: 'actor',
        camp: 'ally',
        category: 'memosprite',
        name: 'Test sprite',
        baseSpeed: inheritedSpeed,
        panelSpeed: inheritedSpeed,
        actionLimit: null,
      },
    },
    {
      type: 'spawnParticipant',
      participant: {
        kind: 'actor',
        camp: 'ally',
        category: 'custom',
        name: 'Test repeating node',
        baseSpeed: 140,
        panelSpeed: 140,
        actionLimit: null,
      },
    },
  ],
  { id: 'test-repeat', characterId: 'test-character', selfPresence: 'present' },
)
export const syntheticPresets = [draftPreset, returnPreset, speedPreset, repeatPreset]
