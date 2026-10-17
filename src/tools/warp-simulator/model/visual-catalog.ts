import type { ToolLocale } from '../../../locales/types'
import type { WarpSnapshot } from '../data/schema'

export interface VisualMetadata {
  readonly path?: string
  readonly element?: string
  readonly portraitPath?: string
  readonly artworkPath?: string
}
export type VisualCatalog = Readonly<Record<string, VisualMetadata>>
export interface VisualDefinition {
  readonly names: Readonly<Record<ToolLocale, string>>
  readonly iconPath?: string
}
export interface VisualDefinitions {
  readonly paths: Readonly<Record<string, VisualDefinition>>
  readonly elements: Readonly<Record<string, VisualDefinition & { readonly color: string }>>
  readonly stars: Readonly<Partial<Record<3 | 4 | 5, string>>>
}
export interface WarpVisualCatalog extends VisualDefinitions {
  readonly schemaVersion: 1
  readonly items: VisualCatalog
}
export const emptyDefinitions: VisualDefinitions = { paths: {}, elements: {}, stars: {} }
export function safeAssetPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('game-assets/') &&
    value.endsWith('.webp') &&
    !/[\\:?#%]/.test(value) &&
    value.split('/').every((part) => !!part && part !== '.' && part !== '..')
  )
}
export function visualAssetPaths(catalog: WarpVisualCatalog): string[] {
  return [
    ...new Set(
      [
        ...Object.values(catalog.items).flatMap((item) => [item.portraitPath, item.artworkPath]),
        ...Object.values(catalog.paths).map((row) => row.iconPath),
        ...Object.values(catalog.elements).map((row) => row.iconPath),
        ...Object.values(catalog.stars),
      ].filter((value): value is string => value !== undefined),
    ),
  ].sort()
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
/** Checks only the tool-owned projection; never reads upstream data. */
export function assertVisualCatalog(
  value: unknown,
  snapshot: WarpSnapshot,
): asserts value is WarpVisualCatalog {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !record(value.items) ||
    !record(value.paths) ||
    !record(value.elements) ||
    !record(value.stars)
  )
    throw new Error('Invalid Warp visual catalog')
  if (
    JSON.stringify(Object.keys(value.items).sort()) !==
    JSON.stringify(snapshot.items.map((item) => item.id).sort())
  )
    throw new Error('Warp visual item inventory mismatch')
  for (const [group, definitions] of [
    ['paths', value.paths],
    ['elements', value.elements],
  ] as const) {
    for (const definition of Object.values(definitions)) {
      if (
        !record(definition) ||
        !record(definition.names) ||
        !['zh-CN', 'en'].every(
          (locale) =>
            typeof (definition.names as Record<string, unknown>)[locale] === 'string' &&
            !!(definition.names as Record<string, string>)[locale]?.trim(),
        )
      )
        throw new Error('Invalid localized visual definition')
      if (definition.iconPath !== undefined && !safeAssetPath(definition.iconPath))
        throw new Error('Unsafe icon path')
      if (
        group === 'elements' &&
        (typeof definition.color !== 'string' || !/^#[\da-f]{6}$/i.test(definition.color))
      )
        throw new Error('Invalid element color')
    }
  }
  for (const item of snapshot.items) {
    const row = value.items[item.id]
    if (
      !record(row) ||
      (row.path !== undefined &&
        (typeof row.path !== 'string' || !Object.hasOwn(value.paths, row.path))) ||
      (row.element !== undefined &&
        (item.kind !== 'avatar' ||
          typeof row.element !== 'string' ||
          !Object.hasOwn(value.elements, row.element)))
    )
      throw new Error('Invalid item visual mapping: ' + item.id)
    for (const field of ['portraitPath', 'artworkPath'])
      if (row[field] !== undefined && !safeAssetPath(row[field]))
        throw new Error('Unsafe item image path')
  }
  for (const [rarity, file] of Object.entries(value.stars))
    if (!['3', '4', '5'].includes(rarity) || !safeAssetPath(file))
      throw new Error('Invalid rarity image')
}
