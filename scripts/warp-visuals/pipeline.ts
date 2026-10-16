import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import sourceLock from './source-lock.json'
import { digest, metadata, inside, exists, readBytes } from '../warp-data/files'
import type { WarpSnapshot } from '../../src/tools/warp-simulator/data/schema'
import {
  assertVisualCatalog,
  visualAssetPaths,
  type WarpVisualCatalog,
  type VisualMetadata,
  type VisualDefinition,
} from '../../src/tools/warp-simulator/model/visual-catalog'

export const visualDirectory = 'src/tools/warp-simulator/data/visuals'
export const assetDirectory = 'public/game-assets/warp'
const snapshotFile = 'src/tools/warp-simulator/data/runtime/snapshot.json'
const plannerCatalogFile = 'src/tools/action-planner/data/game/catalog.json'
const plannerManifestFile = 'src/tools/action-planner/data/game/manifest.json'
type SourceLock = typeof sourceLock
type FileMeta = ReturnType<typeof metadata>
export interface VisualManifest {
  schemaVersion: 1
  source: { repository: string; commit: string }
  generatedAt: string
  transform: SourceLock['transform'] & { sharpVersion: string }
  snapshotSha256: string
  inputs: Record<string, FileMeta>
  localInputs: Record<string, FileMeta>
  files: Record<string, FileMeta & { width?: number; height?: number }>
  assets: { source: string; output: string; transformKey: string }[]
  missingAssets: { id: string; slot: string; sourcePath?: string; reason: string }[]
}
export interface SourceReader {
  read: (file: string) => Buffer | undefined
}
/** Read immutable objects; even untracked OS files in the checkout are irrelevant. */
export async function gitSource(
  root: string,
  lock: SourceLock = sourceLock,
): Promise<SourceReader> {
  const resolved = await realpath(root)
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', resolved, ...args], {
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  if (git('rev-parse', '--show-toplevel').toString().trim() !== resolved)
    throw new Error('Source must be a Git root')
  git('cat-file', '-e', lock.commit + '^{commit}')
  const files = new Set(
    git('ls-tree', '-r', '--name-only', lock.commit).toString().trim().split('\n'),
  )
  return { read: (file) => (files.has(file) ? git('show', lock.commit + ':' + file) : undefined) }
}
async function json<T>(root: string, relative: string): Promise<T> {
  return JSON.parse((await readBytes(root, relative)).toString()) as T
}
async function write(root: string, relative: string, bytes: Buffer | string) {
  const file = await inside(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes, { flag: 'wx' })
}
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + '\n'
async function list(root: string, relative: string): Promise<string[]> {
  const directory = await inside(root, relative)
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = relative + '/' + entry.name
    if (entry.isSymbolicLink()) throw new Error('Refuse asset symlink')
    if (entry.isDirectory()) files.push(...(await list(root, file)))
    else if (entry.isFile()) files.push(file)
    else throw new Error('Unexpected asset entry')
  }
  return files.sort()
}

/** Normal validation reads only committed project outputs and small normalized snapshots. */
export async function validateVisuals(
  root: string,
  lock: SourceLock = sourceLock,
  sharedRoot = root,
) {
  const snapshot = await json<WarpSnapshot>(root, snapshotFile)
  const catalog = await json<unknown>(root, visualDirectory + '/catalog.json')
  assertVisualCatalog(catalog, snapshot)
  const manifest = await json<VisualManifest>(root, visualDirectory + '/manifest.json')
  if (
    manifest.schemaVersion !== 1 ||
    manifest.source.repository !== lock.repository ||
    manifest.source.commit !== lock.commit ||
    JSON.stringify(manifest.transform) !==
      JSON.stringify({ ...lock.transform, sharpVersion: sharp.versions.sharp }) ||
    manifest.snapshotSha256 !== digest(await readBytes(root, snapshotFile))
  )
    throw new Error('Warp visual source/transform/snapshot mismatch')
  if (
    JSON.stringify(Object.keys(manifest.localInputs).sort()) !==
    JSON.stringify([plannerCatalogFile, plannerManifestFile].sort())
  )
    throw new Error('Shared provenance inventory mismatch')
  for (const locale of ['cn', 'en'])
    for (const name of ['characters', 'light_cones', 'paths', 'elements'])
      if (!manifest.inputs[`index_new/${locale}/${name}.json`])
        throw new Error('Missing visual index provenance')
  for (const asset of manifest.assets) {
    const source = manifest.inputs[asset.source]
    const [hash, size, quality, alpha] = asset.transformKey.split(':')
    const output = manifest.files['public/' + asset.output]
    if (
      !source ||
      source.sha256 !== hash ||
      ![
        lock.transform.avatarSize,
        lock.transform.lightConeSize,
        lock.transform.iconSize,
        lock.transform.starSize,
      ].includes(Number(size)) ||
      ![lock.transform.quality, lock.transform.iconQuality].includes(Number(quality)) ||
      Number(alpha) !== lock.transform.alphaQuality ||
      asset.output !== `game-assets/warp/${digest(asset.transformKey)}.webp` ||
      !output?.width ||
      !output.height ||
      output.width > Number(size) ||
      output.height > Number(size)
    )
      throw new Error('Invalid visual conversion provenance')
  }
  for (const [relative, meta] of Object.entries(manifest.localInputs))
    if (JSON.stringify(metadata(await readBytes(sharedRoot, relative))) !== JSON.stringify(meta))
      throw new Error('Shared source changed: ' + relative)
  const expected = [
    visualDirectory + '/catalog.json',
    ...visualAssetPaths(catalog).map((file) => 'public/' + file),
  ].sort()
  if (JSON.stringify(expected) !== JSON.stringify(Object.keys(manifest.files).sort()))
    throw new Error('Warp visual inventory mismatch')
  for (const [file, meta] of Object.entries(manifest.files)) {
    const bytes = await readBytes(
      file.startsWith(assetDirectory + '/') || file.startsWith(visualDirectory + '/')
        ? root
        : sharedRoot,
      file,
    )
    if (digest(bytes) !== meta.sha256 || bytes.length !== meta.bytes)
      throw new Error('Warp visual checksum mismatch: ' + file)
    if (file.endsWith('.webp')) {
      const actual = await sharp(bytes).metadata()
      if (actual.format !== 'webp' || actual.width !== meta.width || actual.height !== meta.height)
        throw new Error('Warp image dimensions mismatch')
    }
  }
  const owned = expected.filter((file) => file.startsWith(assetDirectory + '/'))
  if (JSON.stringify(await list(root, assetDirectory)) !== JSON.stringify(owned))
    throw new Error('Unexpected Warp image files')
  if (
    JSON.stringify(await list(root, visualDirectory)) !==
    JSON.stringify([visualDirectory + '/catalog.json', visualDirectory + '/manifest.json'])
  )
    throw new Error('Unexpected Warp metadata files')
  return {
    items: Object.keys(catalog.items).length,
    newAssets: owned.length,
    reusedAssets: expected.length - owned.length - 1,
    assetBytes: owned.reduce((n, file) => n + manifest.files[file]!.bytes, 0),
    missing: manifest.missingAssets.length,
  }
}

interface IndexRow {
  id: string
  path?: string
  element?: string
  rarity?: number
  portrait?: string
  icon?: string
  name: string
  color?: string
}
type Index = Record<string, IndexRow>
export async function generateVisuals(
  root: string,
  stage: string,
  source: SourceReader,
  lock: SourceLock = sourceLock,
) {
  const snapshotBytes = await readBytes(root, snapshotFile)
  const snapshot = JSON.parse(snapshotBytes.toString()) as WarpSnapshot
  const manifest: VisualManifest = {
    schemaVersion: 1,
    source: { repository: lock.repository, commit: lock.commit },
    generatedAt: new Date().toISOString(),
    transform: { ...lock.transform, sharpVersion: sharp.versions.sharp },
    snapshotSha256: digest(snapshotBytes),
    inputs: {},
    localInputs: {},
    files: {},
    assets: [],
    missingAssets: [],
  }
  function input(file: string) {
    const bytes = source.read(file)
    if (bytes) manifest.inputs[file] = metadata(bytes)
    return bytes
  }
  const indices: Record<string, Index> = {}
  for (const locale of ['cn', 'en'])
    for (const name of ['characters', 'light_cones', 'paths', 'elements']) {
      const file = `index_new/${locale}/${name}.json`,
        bytes = input(file)
      if (!bytes) throw new Error('Missing source index: ' + file)
      indices[locale + '/' + name] = JSON.parse(bytes.toString()) as Index
    }
  for (const file of [plannerCatalogFile, plannerManifestFile])
    manifest.localInputs[file] = metadata(await readBytes(root, file))
  const planner = await json<{
    characters: { id: string; assetKey?: string }[]
    assets: Record<string, { path: string }>
  }>(root, plannerCatalogFile)
  const plannerManifest = await json<{
    source: { commit: string }
    files: Record<string, FileMeta>
  }>(root, plannerManifestFile)
  if (plannerManifest.source.commit !== lock.commit)
    throw new Error('Shared portraits must use the locked source')
  const items: Record<string, VisualMetadata> = {},
    paths: Record<string, VisualDefinition> = {},
    elements: Record<string, VisualDefinition & { color: string }> = {},
    stars: Partial<Record<3 | 4 | 5, string>> = {}
  const converted = new Map<string, string>()
  async function asset(
    id: string,
    slot: string,
    sourcePath: string | undefined,
    size: number,
    quality: number,
  ): Promise<string | undefined> {
    if (
      !sourcePath ||
      /[\\:?#%]/.test(sourcePath) ||
      sourcePath.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      manifest.missingAssets.push({ id, slot, reason: 'missing-or-unsafe-source-path' })
      return undefined
    }
    const bytes = input(sourcePath)
    if (!bytes) {
      manifest.missingAssets.push({ id, slot, sourcePath, reason: 'missing-source-file' })
      return undefined
    }
    const transformKey = `${digest(bytes)}:${size}:${quality}:${lock.transform.alphaQuality}`
    let output = converted.get(transformKey)
    if (!output) {
      output = `game-assets/warp/${digest(transformKey)}.webp`
      const result = await sharp(bytes)
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, alphaQuality: lock.transform.alphaQuality })
        .toBuffer({ resolveWithObject: true })
      await write(stage, 'public/' + output, result.data)
      manifest.files['public/' + output] = {
        ...metadata(result.data),
        width: result.info.width,
        height: result.info.height,
      }
      converted.set(transformKey, output)
    }
    manifest.assets.push({ source: sourcePath, output, transformKey })
    return output
  }
  async function definition(
    group: 'paths' | 'elements',
    id: string,
  ): Promise<VisualDefinition & { color?: string }> {
    const cn = indices['cn/' + group]![id],
      en = indices['en/' + group]![id]
    if (
      !cn ||
      !en ||
      cn.id !== id ||
      en.id !== id ||
      cn.icon !== en.icon ||
      !cn.name ||
      !en.name ||
      (group === 'elements' && cn.color !== en.color)
    )
      throw new Error('Invalid bilingual definition: ' + id)
    return {
      names: { 'zh-CN': cn.name, en: en.name },
      iconPath: await asset(
        id,
        'icon',
        cn.icon,
        lock.transform.iconSize,
        lock.transform.iconQuality,
      ),
      ...(group === 'elements' ? { color: cn.color } : {}),
    }
  }
  for (const item of snapshot.items) {
    const group = item.kind === 'avatar' ? 'characters' : 'light_cones',
      numericId = item.id.split(':')[1]!
    const cn = indices['cn/' + group]![numericId],
      en = indices['en/' + group]![numericId]
    if (!cn || !en) {
      items[item.id] = {}
      manifest.missingAssets.push({ id: item.id, slot: 'metadata', reason: 'missing-source-row' })
      continue
    }
    if (
      cn.id !== numericId ||
      en.id !== numericId ||
      cn.rarity !== item.rarity ||
      en.rarity !== item.rarity ||
      cn.path !== en.path ||
      cn.element !== en.element ||
      cn.portrait !== en.portrait
    )
      throw new Error('Item identity or bilingual mismatch: ' + item.id)
    if (cn.path && !paths[cn.path]) paths[cn.path] = await definition('paths', cn.path)
    if (item.kind === 'avatar' && cn.element && !elements[cn.element]) {
      const row = await definition('elements', cn.element)
      if (!row.color || !/^#[\da-f]{6}$/i.test(row.color))
        throw new Error('Invalid source element color')
      elements[cn.element] = { ...row, color: row.color }
    }
    let portraitPath: string | undefined
    if (item.kind === 'avatar') {
      const character = planner.characters.find((row) => row.id === numericId)
      const shared = character?.assetKey ? planner.assets[character.assetKey] : undefined
      if (shared) {
        const relative = 'public/' + shared.path,
          bytes = await readBytes(root, relative),
          recorded = plannerManifest.files[relative]
        if (!recorded || recorded.sha256 !== digest(bytes) || recorded.bytes !== bytes.length)
          throw new Error('Shared portrait checksum mismatch')
        const actual = await sharp(bytes).metadata()
        manifest.files[relative] = {
          ...metadata(bytes),
          width: actual.width,
          height: actual.height,
        }
        portraitPath = shared.path
      }
    }
    items[item.id] = {
      path: cn.path,
      ...(item.kind === 'avatar' ? { element: cn.element } : {}),
      portraitPath,
      artworkPath: await asset(
        item.id,
        'artwork',
        cn.portrait,
        item.kind === 'avatar' ? lock.transform.avatarSize : lock.transform.lightConeSize,
        lock.transform.quality,
      ),
    }
  }
  for (const rarity of [3, 4, 5] as const)
    stars[rarity] = await asset(
      String(rarity),
      'stars',
      `icon/deco/Star${rarity}.png`,
      lock.transform.starSize,
      lock.transform.iconQuality,
    )
  const catalog: WarpVisualCatalog = { schemaVersion: 1, items, paths, elements, stars }
  assertVisualCatalog(catalog, snapshot)
  const catalogBytes = serialize(catalog)
  manifest.files[visualDirectory + '/catalog.json'] = metadata(catalogBytes)
  await mkdir(await inside(stage, assetDirectory), { recursive: true })
  await write(stage, snapshotFile, snapshotBytes)
  await write(stage, visualDirectory + '/catalog.json', catalogBytes)
  await write(stage, visualDirectory + '/manifest.json', serialize(manifest))
  await validateVisuals(stage, lock, root)
  return manifest
}

export class RecoveryError extends AggregateError {}
/** Both owned directories roll back together; shared assets are never moved. */
export async function publishVisuals(
  root: string,
  stage: string,
  runId: string,
  hook?: (index: number) => void,
) {
  const backup = await inside(root, '.warp-visuals-backup/' + runId)
  if (await exists(backup)) throw new Error('Refuse existing Warp visual backup')
  await mkdir(backup, { recursive: true })
  const moved: { target: string; saved: string }[] = [],
    installed: string[] = []
  try {
    for (const [index, relative] of [assetDirectory, visualDirectory].entries()) {
      const target = await inside(root, relative),
        saved = path.join(backup, String(index))
      if (await exists(target)) {
        await rename(target, saved)
        moved.push({ target, saved })
      }
      await mkdir(path.dirname(target), { recursive: true })
      await rename(await inside(stage, relative), target)
      installed.push(target)
      hook?.(index)
    }
  } catch (error) {
    try {
      for (const target of installed.reverse()) await rm(target, { recursive: true })
      for (const { target, saved } of moved.reverse()) await rename(saved, target)
    } catch (recovery) {
      throw new RecoveryError(
        [error, recovery],
        'Warp visual rollback failed; preserve staging, backup and lock',
      )
    }
    throw error
  }
  await rm(backup, { recursive: true })
}
export async function withUpdateLock(
  root: string,
  operation: (stage: string, runId: string) => Promise<void>,
) {
  const runId = randomUUID(),
    guard = await inside(root, '.warp-visuals-staging/update.lock')
  await mkdir(path.dirname(guard), { recursive: true })
  await writeFile(guard, runId, { flag: 'wx' })
  const stage = await inside(root, '.warp-visuals-staging/' + runId)
  let recoveryFailed = false
  try {
    await operation(stage, runId)
  } catch (error) {
    recoveryFailed = error instanceof RecoveryError
    throw error
  } finally {
    if (!recoveryFailed) {
      await rm(stage, { recursive: true, force: true })
      await rm(guard)
    }
  }
}
export async function updateVisuals(root: string, sourceRoot: string) {
  const source = await gitSource(sourceRoot)
  await withUpdateLock(root, async (stage, runId) => {
    await generateVisuals(root, stage, source)
    await publishVisuals(root, stage, runId)
  })
  return validateVisuals(root)
}
