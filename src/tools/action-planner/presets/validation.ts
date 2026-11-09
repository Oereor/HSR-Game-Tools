import Ajv from 'ajv'
import { baseCompile } from '@intlify/message-compiler'
import schema from './preset.schema.json'
import type { GameSnapshot } from '../data/schema'
import { validateOperations } from '../engine/validation'
import { effectCharacterId } from '../engine/character-effects'
import { collectInputs, PresetError, valueResolver } from './values'
import { PRESET_LIMITS, type PresetDefinition, type Value } from './types'

const ajv = new Ajv({ allErrors: true, ownProperties: true })
const check = ajv.compile<PresetDefinition>(schema)
export function messageAt(root: unknown, key: string): string | undefined {
  const result = key
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === 'object' && Object.hasOwn(value, part)
          ? (value as Record<string, unknown>)[part]
          : undefined,
      root,
    )
  return typeof result === 'string' && result.trim() ? result : undefined
}
export function validatePresets(
  definitions: readonly unknown[],
  messages: readonly unknown[],
  game: GameSnapshot,
): asserts definitions is readonly PresetDefinition[] {
  const ids = new Set<string>()
  for (const definition of definitions) {
    function guard(value: unknown, depth = 0) {
      if (depth > 64) throw new PresetError('depth')
      if (value && typeof value === 'object')
        for (const child of Object.values(value)) guard(child, depth + 1)
    }
    guard(definition)
    if (!check(definition)) throw new Error(ajv.errorsText(check.errors))
    const preset = definition
    if (!preset.id.trim()) throw new PresetError('preset-id')
    if (preset.selfPresence && !preset.characterId) throw new PresetError('self-reference')
    if (ids.has(definition.id)) throw new PresetError('duplicate-preset')
    ids.add(definition.id)
    if (definition.characterId && !game.characters.some((c) => c.id === definition.characterId))
      throw new PresetError('character-reference')
    const icon = definition.icon
    if (
      icon &&
      ('assetKey' in icon
        ? !Object.hasOwn(game.assets, icon.assetKey)
        : !game.characters.some((c) => c.id === icon.characterId))
    )
      throw new PresetError('icon-reference')
    const keys = [
      definition.i18n.name,
      definition.i18n.description,
      ...Object.values(definition.i18n.unavailable ?? {}),
    ]
    const inputs = collectInputs(definition)
    const parameterIds = new Set(inputs.map((i) => i.id))
    let count = 0
    function walk(value: unknown, depth = 0) {
      if (depth > 64) throw new PresetError('depth')
      if (!value || typeof value !== 'object') return
      const row = value as Record<string, unknown>
      if (row.type === 'ref' && !parameterIds.has(String(row.id)))
        throw new PresetError('parameter-reference')
      if (row.snapshot && !Object.hasOwn(preset.snapshots ?? {}, String(row.snapshot)))
        throw new PresetError('snapshot-reference')
      if (row.target === 'self' && !preset.characterId) throw new PresetError('self-reference')
      if (row.type === 'self-stat' && !preset.characterId) throw new PresetError('self-reference')
      if (row.type === 'i18n') {
        keys.push(String(row.key))
        for (const locale of messages) {
          const text = messageAt(locale, String(row.key))
          if (!text) throw new PresetError('i18n-reference')
          const expected = new Set<string>()
          const ast = baseCompile(text, {
            onError: (error) => {
              throw error
            },
          }).ast
          function visit(node: unknown) {
            if (!node || typeof node !== 'object') return
            const entry = node as Record<string, unknown>
            if (entry.type === 4 && typeof entry.key === 'string') expected.add(entry.key)
            for (const child of Object.values(entry))
              if (typeof child === 'object') {
                if (Array.isArray(child)) child.forEach(visit)
                else visit(child)
              }
          }
          visit(ast)
          const supplied = Object.keys((row.params ?? {}) as object)
          if (expected.size !== supplied.length || supplied.some((key) => !expected.has(key)))
            throw new PresetError('i18n-parameters')
        }
      }
      if (row.type === 'user-input' && row.i18n)
        keys.push(...Object.values(row.i18n as Record<string, string>))
      for (const child of Object.values(value)) walk(child, depth + 1)
    }
    function operations(ops: PresetDefinition['operations'], depth = 0) {
      if (depth > PRESET_LIMITS.depth) throw new PresetError('depth')
      for (const op of ops) {
        if (++count > PRESET_LIMITS.operations) throw new PresetError('operations')
        if (
          op.type === 'characterEffect' &&
          (depth !== 0 ||
            preset.interaction !== 'batch' ||
            preset.characterId !== effectCharacterId(op.effectId) ||
            (preset.startOnly && op.effectId === 'bronya.e1.refund'))
        )
          throw new PresetError('character-effect')
        if (op.onEmpty && op.target !== 'allies' && op.target !== 'enemies')
          throw new PresetError('onEmpty')
        if (op.onTrigger) operations(op.onTrigger, depth + 1)
      }
    }
    operations(definition.operations)
    if (
      definition.interaction === 'draft' &&
      (count !== 1 ||
        definition.operations[0]!.onTrigger ||
        definition.operations[0]!.type === 'changeSkillPoints')
    )
      throw new PresetError('draft-operation')
    walk(definition)
    for (const preview of definition.previews ?? []) walk({ type: 'i18n', ...preview })
    for (const key of keys)
      if (messages.some((locale) => !messageAt(locale, key)))
        throw new Error(`Missing preset translation: ${key}`)
    // Resolve defaults in both languages, checking reference types and arithmetic.
    for (const locale of messages) {
      // Structural/default checks only: the real panel speed is checked at insertion.
      const resolver = valueResolver(
        definition,
        game.characters,
        (key) => messageAt(locale, key)!,
        {},
        { panelSpeed: 100 },
      )
      function validateDefaults(ops: PresetDefinition['operations']) {
        for (const op of ops) {
          const resolved = resolver.resolveOperation(
            op,
            { id: 'static-check' },
            () => ({ kind: 'participants', participantIds: ['static-target'] }),
            'operation-default',
          )
          if (validateOperations([resolved], { kind: 'start' }).length)
            throw new PresetError('operation-default')
          if (op.onTrigger) validateDefaults(op.onTrigger)
        }
      }
      validateDefaults(definition.operations)
      for (const preview of definition.previews ?? [])
        for (const value of Object.values(preview.params)) resolver.resolve(value as Value)
    }
  }
}
