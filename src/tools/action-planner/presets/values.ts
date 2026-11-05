import type { CharacterRecord } from '../data/schema'
import type { TargetedOperation } from '../engine/types'
import {
  PRESET_LIMITS,
  type Input,
  type PresetDefinition,
  type Translate,
  type Value,
} from './types'

export class PresetError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}
/** Selection is captured at insertion; nested operations may use it after presence changes. */
export function selectionOperation(
  definition: PresetDefinition,
): { type: TargetedOperation['type']; nested: boolean } | undefined {
  function find(
    operations: PresetDefinition['operations'],
    nested: boolean,
  ): ReturnType<typeof selectionOperation> {
    for (const operation of operations) {
      if (operation.target === 'selected' && operation.type !== 'spawnParticipant')
        return { type: operation.type, nested }
      const child = operation.onTrigger && find(operation.onTrigger, true)
      if (child) return child
    }
  }
  return find(definition.operations, false)
}
export function collectInputs(definition: PresetDefinition): Input[] {
  const inputs = new Map<string, Input>()
  const canonical = (value: unknown): string =>
    value && typeof value === 'object'
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          ),
        )
      : JSON.stringify(value)
  function walk(value: unknown, depth = 0) {
    if (depth > 64) throw new PresetError('depth')
    if (!value || typeof value !== 'object') return
    if ('type' in value && value.type === 'user-input') {
      const input = value as Input
      const old = inputs.get(input.id)
      if (old && canonical(old) !== canonical(input)) throw new PresetError('parameter-conflict')
      inputs.set(input.id, input)
      if (inputs.size > PRESET_LIMITS.inputs) throw new PresetError('inputs')
    }
    for (const child of Object.values(value)) walk(child, depth + 1)
  }
  walk(definition)
  return [...inputs.values()]
}
export function valueResolver(
  definition: PresetDefinition,
  characters: readonly CharacterRecord[],
  translate: Translate,
  supplied: Record<string, unknown> = {},
) {
  const inputs = new Map(collectInputs(definition).map((input) => [input.id, input]))
  const parameters = new Map<string, string | number>()
  function resolve(value: Value, depth = 0): string | number | null {
    if (depth > PRESET_LIMITS.valueDepth) throw new PresetError('value-depth')
    if (value === null || typeof value === 'string') return value
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new PresetError('non-finite')
      return value
    }
    switch (value.type) {
      case 'character-stat': {
        const speed = characters.find((c) => c.id === value.characterId)?.baseSpeed
        if (speed === undefined || !Number.isFinite(speed) || speed <= 0)
          throw new PresetError('character-stat')
        return speed
      }
      case 'user-input':
      case 'ref': {
        if (parameters.has(value.id)) return parameters.get(value.id)!
        const input = inputs.get(value.id)
        if (!input) throw new PresetError('parameter-reference')
        const fallback = resolve(input.value, depth + 1)
        if (
          typeof fallback !== 'number' &&
          (input.minimum !== undefined || input.exclusiveMinimum !== undefined)
        )
          throw new PresetError(input.id)
        const result = Object.hasOwn(supplied, value.id) ? supplied[value.id] : fallback
        if (
          typeof result !== typeof fallback ||
          (typeof result !== 'string' && typeof result !== 'number') ||
          (typeof result === 'number' &&
            (!Number.isFinite(result) ||
              (input.minimum !== undefined && result < input.minimum) ||
              (input.exclusiveMinimum !== undefined && result <= input.exclusiveMinimum)))
        )
          throw new PresetError(input.id)
        parameters.set(value.id, result)
        return result
      }
      case 'i18n': {
        const params: Record<string, string | number> = {}
        for (const [key, val] of Object.entries(value.params ?? {})) {
          const result = resolve(val, depth + 1)
          if (result === null) throw new PresetError('i18n-parameter')
          Object.defineProperty(params, key, { value: result, enumerable: true })
        }
        return translate(value.key, params)
      }
      case 'multiply':
      case 'divide': {
        const left = resolve(value.left, depth + 1),
          right = resolve(value.right, depth + 1)
        if (
          typeof left !== 'number' ||
          typeof right !== 'number' ||
          (value.type === 'divide' && right === 0)
        )
          throw new PresetError('arithmetic')
        const result = value.type === 'multiply' ? left * right : left / right
        if (!Number.isFinite(result)) throw new PresetError('speed')
        return result
      }
    }
  }
  // Validate every declared input, including ones used only by a preview.
  for (const input of inputs.values()) resolve(input)
  for (const key of Object.keys(supplied))
    if (!inputs.has(key)) throw new PresetError('parameter-reference')
  function tree(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    if (
      'type' in value &&
      ['user-input', 'ref', 'character-stat', 'i18n', 'multiply', 'divide'].includes(
        String(value.type),
      )
    )
      return resolve(value as Value)
    if (Array.isArray(value)) return value.map(tree)
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, tree(child)]))
  }
  return { resolve, tree }
}
