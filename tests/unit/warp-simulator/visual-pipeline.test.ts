import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import lock from '../../../scripts/warp-visuals/source-lock.json'
import {
  generateVisuals,
  validateVisuals,
  gitSource,
  publishVisuals,
  withUpdateLock,
  visualDirectory,
  assetDirectory,
} from '../../../scripts/warp-visuals/pipeline'
import { metadata } from '../../../scripts/warp-data/files'
import { validateGameFiles } from '../../../scripts/game-data/files'
import { fileURLToPath } from 'node:url'
import type { WarpSnapshot } from '../../../src/tools/warp-simulator/data/schema'
import runtimeSnapshot from '../../../src/tools/warp-simulator/data/runtime/snapshot.json'
import visualManifest from '../../../src/tools/warp-simulator/data/visuals/manifest.json'
import { starFixture } from '../../fixtures/warp-simulator/stars'

const temps: string[] = []
afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true })
})
async function temp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'warp-visual-test-'))
  temps.push(dir)
  return dir
}
async function write(root: string, relative: string, content: string | Buffer) {
  const file = path.join(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}
async function fixture() {
  const root = await temp(),
    stage = path.join(root, 'stage')
  const image = await sharp({
    create: { width: 16, height: 24, channels: 4, background: '#8f8fff' },
  })
    .png()
    .toBuffer()
  const portrait = await sharp(image).webp().toBuffer()
  const snapshot: WarpSnapshot = {
    schemaVersion: 1,
    banners: [],
    sharedPools: [],
    items: [
      { id: 'avatar:1', kind: 'avatar', rarity: 5, names: { 'zh-CN': '甲', en: 'A' } },
      { id: 'light-cone:1', kind: 'light-cone', rarity: 3, names: { 'zh-CN': '乙', en: 'B' } },
    ],
  }
  await write(root, 'src/tools/warp-simulator/data/runtime/snapshot.json', JSON.stringify(snapshot))
  await write(root, 'public/game-assets/character/1.webp', portrait)
  await write(
    root,
    'src/tools/action-planner/data/game/catalog.json',
    JSON.stringify({
      characters: [{ id: '1', assetKey: 'character:1' }],
      assets: { 'character:1': { path: 'game-assets/character/1.webp' } },
    }),
  )
  await write(
    root,
    'src/tools/action-planner/data/game/manifest.json',
    JSON.stringify({
      source: { commit: lock.commit },
      files: { 'public/game-assets/character/1.webp': metadata(portrait) },
    }),
  )
  const inputs: Record<string, Buffer> = {}
  for (const locale of ['cn', 'en']) {
    for (const [group, data] of Object.entries({
      characters: {
        1: {
          id: '1',
          name: 'A',
          rarity: 5,
          path: 'Warrior',
          element: 'Quantum',
          portrait: 'image/character_portrait/1.png',
        },
      },
      light_cones: {
        1: {
          id: '1',
          name: 'B',
          rarity: 3,
          path: 'Warrior',
          portrait: 'image/light_cone_portrait/1.png',
        },
      },
      paths: {
        Warrior: {
          id: 'Warrior',
          name: locale === 'cn' ? '毁灭' : 'Destruction',
          icon: 'icon/path/Destruction.png',
        },
      },
      elements: {
        Quantum: {
          id: 'Quantum',
          name: locale === 'cn' ? '量子' : 'Quantum',
          icon: 'icon/element/Quantum.png',
          color: '#1C29BA',
        },
      },
    }))
      inputs[`index_new/${locale}/${group}.json`] = Buffer.from(JSON.stringify(data))
  }
  for (const file of [
    'image/character_portrait/1.png',
    'image/light_cone_portrait/1.png',
    'icon/path/Destruction.png',
    'icon/element/Quantum.png',
  ])
    inputs[file] = image
  for (const rarity of [3, 4, 5]) inputs[`icon/deco/Star${rarity}.png`] = await starFixture(rarity)
  return { root, stage, inputs, source: { read: (file: string) => inputs[file] } }
}
describe('explicit Warp visual updater', () => {
  it('validates committed assets offline, separately from the unchanged planner inventory', async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    expect(await validateVisuals(root)).toMatchObject({
      items: runtimeSnapshot.items.length,
      newAssets: Object.keys(visualManifest.files).filter((file) =>
        file.startsWith(assetDirectory + '/'),
      ).length,
      reusedAssets: Object.keys(visualManifest.files).filter(
        (file) => file.startsWith('public/game-assets/') && !file.startsWith(assetDirectory + '/'),
      ).length,
      missing: 0,
    })
    expect(await validateGameFiles(root)).toMatchObject({ assets: 101, missing: 0 })
  })
  it('projects canonical identities, deduplicates equal inputs and leaves shared images untouched', async () => {
    const f = await fixture(),
      before = await readFile(path.join(f.root, 'public/game-assets/character/1.webp'))
    const manifest = await generateVisuals(f.root, f.stage, f.source)
    const catalog = JSON.parse(
      await readFile(path.join(f.stage, visualDirectory, 'catalog.json'), 'utf8'),
    )
    expect(catalog.items['avatar:1']).toMatchObject({
      path: 'Warrior',
      element: 'Quantum',
      portraitPath: 'game-assets/character/1.webp',
    })
    expect(catalog.items['light-cone:1'].element).toBeUndefined()
    expect(catalog.paths.Warrior.names).toEqual({ 'zh-CN': '毁灭', en: 'Destruction' })
    expect(catalog.paths.Warrior.iconPath).toBe(catalog.elements.Quantum.iconPath)
    expect(new Set(Object.values(catalog.stars)).size).toBe(3)
    expect(catalog.items['avatar:1'].revealArtwork).toMatchObject({ width: 16, height: 24 })
    expect(catalog.items['avatar:1'].revealArtwork).toEqual(
      catalog.items['light-cone:1'].revealArtwork,
    )
    expect(catalog.paths.Warrior.revealIcon).toMatchObject({ width: 16, height: 24 })
    expect(catalog.revealStars['5']).toMatchObject({ width: 640, height: 128 })
    expect(catalog.cardStars['3']).toMatchObject({ width: 196, height: 68 })
    expect(manifest.inputs['image/character_portrait/1.png']).toMatchObject({
      width: 16,
      height: 24,
    })
    expect(new Set(manifest.assets.map((asset) => asset.purpose)).size).toBe(8)
    expect((await readdir(path.join(f.stage, assetDirectory))).length).toBe(12)
    expect(manifest.inputs['index_new/cn/characters.json']).toEqual(
      metadata(f.inputs['index_new/cn/characters.json']!),
    )
    await publishVisuals(f.root, f.stage, 'fixture')
    expect(await validateVisuals(f.root)).toMatchObject({
      items: 2,
      newAssets: 12,
      reusedAssets: 1,
    })
    expect(await readFile(path.join(f.root, 'public/game-assets/character/1.webp'))).toEqual(before)
  })
  it('reuses verified bytes and repairs a missing or corrupt cached output', async () => {
    const f = await fixture()
    const first = await generateVisuals(f.root, f.stage, f.source)
    await publishVisuals(f.root, f.stage, 'cache')
    const again = await generateVisuals(f.root, path.join(f.root, 'second'), f.source)
    expect(again.files).toEqual(first.files)
    const hd = first.assets.find((asset) => asset.purpose === 'reveal-artwork')!
    await rm(path.join(f.root, 'public/' + hd.output))
    const repaired = await generateVisuals(f.root, path.join(f.root, 'third'), f.source)
    expect(repaired.files).toEqual(first.files)
    await write(f.root, 'public/' + hd.output, 'corrupted')
    const decoded = await generateVisuals(f.root, path.join(f.root, 'fourth'), f.source)
    expect(decoded.files).toEqual(first.files)
  })
  it.each(['crop', 'key', 'dimensions', 'mapping', 'checksum'])(
    'rejects card star corruption: %s',
    async (mutation) => {
      const f = await fixture()
      const manifest = await generateVisuals(f.root, f.stage, f.source)
      await publishVisuals(f.root, f.stage, 'card-star-corrupt')
      const asset = manifest.assets.find((asset) => asset.purpose === 'card-stars')!
      if (mutation === 'crop') asset.crop!.left++
      if (mutation === 'key') asset.transformKey += ':changed'
      if (mutation === 'dimensions') manifest.files['public/' + asset.output]!.width!++
      if (mutation === 'mapping') {
        const catalogFile = visualDirectory + '/catalog.json'
        const catalog = JSON.parse((await readFile(path.join(f.root, catalogFile))).toString())
        delete catalog.cardStars[asset.id]
        await write(f.root, catalogFile, JSON.stringify(catalog))
      }
      if (mutation === 'checksum') await write(f.root, 'public/' + asset.output, 'corrupt')
      await write(f.root, visualDirectory + '/manifest.json', JSON.stringify(manifest))
      await expect(validateVisuals(f.root)).rejects.toThrow(/card star|mapping|checksum/)
    },
  )
  it('diagnoses missing card stars and preserves official files after invalid alpha content', async () => {
    const f = await fixture()
    delete f.inputs['icon/deco/Star4.png']
    const manifest = await generateVisuals(f.root, f.stage, f.source)
    expect(manifest.missingAssets.filter((row) => row.id === '4')).toEqual([
      { id: '4', slot: 'stars', sourcePath: 'icon/deco/Star4.png', reason: 'missing-source-file' },
      {
        id: '4',
        slot: 'card-stars',
        sourcePath: 'icon/deco/Star4.png',
        reason: 'missing-source-file',
      },
    ])
    await publishVisuals(f.root, f.stage, 'missing-stars')
    expect(await validateVisuals(f.root)).toMatchObject({ missing: 2 })
    const before = await readFile(path.join(f.root, visualDirectory, 'manifest.json'))
    f.inputs['icon/deco/Star4.png'] = await sharp({
      create: { width: 640, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    await expect(
      withUpdateLock(f.root, async (stage, runId) => {
        await generateVisuals(f.root, stage, f.source)
        await publishVisuals(f.root, stage, runId)
      }),
    ).rejects.toThrow(/empty/)
    expect(await readFile(path.join(f.root, visualDirectory, 'manifest.json'))).toEqual(before)
    expect(await validateVisuals(f.root)).toMatchObject({ missing: 2 })
  })
  it.each([
    'purpose',
    'source-dimensions',
    'profile',
    'missing-mapping',
    'unsafe-path',
    'extra-source',
  ])('rejects HD provenance drift: %s', async (mutation) => {
    const f = await fixture()
    const manifest = await generateVisuals(f.root, f.stage, f.source)
    await publishVisuals(f.root, f.stage, 'provenance')
    const hd = manifest.assets.find((asset) => asset.purpose === 'reveal-artwork')!
    if (mutation === 'purpose') hd.purpose = 'icon'
    if (mutation === 'source-dimensions') manifest.inputs[hd.source]!.width = 2048
    if (mutation === 'profile') hd.transformKey = hd.transformKey.replace(':88:', ':82:')
    if (mutation === 'missing-mapping')
      manifest.assets = manifest.assets.filter((asset) => asset !== hd)
    if (mutation === 'unsafe-path') {
      manifest.inputs['../bad.png'] = manifest.inputs[hd.source]!
      hd.source = '../bad.png'
    }
    if (mutation === 'extra-source') manifest.inputs['extra.png'] = manifest.inputs[hd.source]!
    await write(f.root, visualDirectory + '/manifest.json', JSON.stringify(manifest))
    await expect(validateVisuals(f.root)).rejects.toThrow(/provenance|conversion|inventory/)
  })
  it.each([0, 1])(
    'restores HD catalog, manifest and bytes after publish failure at %i',
    async (phase) => {
      const f = await fixture()
      const first = await generateVisuals(f.root, f.stage, f.source)
      await publishVisuals(f.root, f.stage, 'hd-initial')
      const catalog = await readFile(path.join(f.root, visualDirectory, 'catalog.json'))
      const manifest = await readFile(path.join(f.root, visualDirectory, 'manifest.json'))
      const replacements = path.join(f.root, 'replacement')
      await generateVisuals(f.root, replacements, f.source)
      await expect(
        publishVisuals(f.root, replacements, 'hd-failure', (index) => {
          if (index === phase) throw new Error('injected HD failure')
        }),
      ).rejects.toThrow('injected HD failure')
      expect(await readFile(path.join(f.root, visualDirectory, 'catalog.json'))).toEqual(catalog)
      expect(await readFile(path.join(f.root, visualDirectory, 'manifest.json'))).toEqual(manifest)
      for (const file of Object.keys(first.files).filter((file) =>
        file.startsWith(assetDirectory),
      )) {
        expect(first.files[file]).toMatchObject(metadata(await readFile(path.join(f.root, file))))
      }
      expect(await validateVisuals(f.root)).toMatchObject({ missing: 0 })
    },
  )
  it('omits missing images explicitly and detects output corruption and unexpected assets', async () => {
    const f = await fixture()
    delete f.inputs['image/character_portrait/1.png']
    const manifest = await generateVisuals(f.root, f.stage, f.source)
    expect(manifest.missingAssets).toContainEqual({
      id: 'avatar:1',
      slot: 'artwork',
      sourcePath: 'image/character_portrait/1.png',
      reason: 'missing-source-file',
    })
    await publishVisuals(f.root, f.stage, 'missing')
    expect(await validateVisuals(f.root)).toMatchObject({ missing: 2 })
    await write(f.root, assetDirectory + '/extra.webp', 'bad')
    await expect(validateVisuals(f.root)).rejects.toThrow(/Unexpected/)
    await rm(path.join(f.root, assetDirectory, 'extra.webp'))
    const file = Object.keys(manifest.files).find((file) => file.startsWith(assetDirectory))!
    await write(f.root, file, 'corrupt')
    await expect(validateVisuals(f.root)).rejects.toThrow(/checksum/)
  })
  it('rejects snapshot and source-lock drift without consulting the source repository', async () => {
    const f = await fixture()
    await generateVisuals(f.root, f.stage, f.source)
    await publishVisuals(f.root, f.stage, 'drift')
    await expect(validateVisuals(f.root, { ...lock, commit: '0'.repeat(40) })).rejects.toThrow(
      /source/,
    )
    const snapshotPath = path.join(f.root, 'src/tools/warp-simulator/data/runtime/snapshot.json')
    await writeFile(snapshotPath, (await readFile(snapshotPath, 'utf8')) + ' ')
    await expect(validateVisuals(f.root)).rejects.toThrow(/snapshot/)
  })
  it('handles absent icon and metadata rows without inventing paths', async () => {
    const f = await fixture()
    delete f.inputs['icon/path/Destruction.png']
    for (const locale of ['cn', 'en'])
      f.inputs[`index_new/${locale}/light_cones.json`] = Buffer.from('{}')
    const manifest = await generateVisuals(f.root, f.stage, f.source)
    expect(manifest.missingAssets).toContainEqual({
      id: 'light-cone:1',
      slot: 'metadata',
      reason: 'missing-source-row',
    })
    const catalog = JSON.parse(
      await readFile(path.join(f.stage, visualDirectory, 'catalog.json'), 'utf8'),
    )
    expect(catalog.items['light-cone:1']).toEqual({})
    expect(catalog.paths.Warrior.iconPath).toBeUndefined()
    expect(manifest.missingAssets).toHaveLength(3)
  })
  it('keeps the previous official snapshot intact after decoding or localization failure', async () => {
    const f = await fixture()
    await generateVisuals(f.root, f.stage, f.source)
    await publishVisuals(f.root, f.stage, 'initial')
    const formal = await readFile(path.join(f.root, visualDirectory, 'manifest.json'))
    f.inputs['image/character_portrait/1.png'] = Buffer.from('invalid png')
    await expect(
      withUpdateLock(f.root, async (stage, runId) => {
        await generateVisuals(f.root, stage, f.source)
        await publishVisuals(f.root, stage, runId)
      }),
    ).rejects.toThrow()
    expect(await readFile(path.join(f.root, visualDirectory, 'manifest.json'))).toEqual(formal)
    expect(await validateVisuals(f.root)).toMatchObject({ missing: 0 })
    const mismatched = JSON.parse(f.inputs['index_new/en/characters.json']!.toString())
    mismatched['1'].path = 'Knight'
    f.inputs['index_new/en/characters.json'] = Buffer.from(JSON.stringify(mismatched))
    await expect(
      generateVisuals(f.root, path.join(f.root, 'other-stage'), f.source),
    ).rejects.toThrow(/mismatch/)
  })
  it.each([0, 1])(
    'rolls back both owned directories after installation failure at %s',
    async (phase) => {
      const root = await temp(),
        stage = path.join(root, 'stage')
      for (const directory of [assetDirectory, visualDirectory]) {
        await write(root, directory + '/sentinel', 'old')
        await write(stage, directory + '/sentinel', 'new')
      }
      await expect(
        publishVisuals(root, stage, 'rollback', (index) => {
          if (index === phase) throw new Error('injected')
        }),
      ).rejects.toThrow('injected')
      for (const directory of [assetDirectory, visualDirectory])
        expect(await readFile(path.join(root, directory, 'sentinel'), 'utf8')).toBe('old')
    },
  )
  it('rejects concurrent updates without removing another owner lock', async () => {
    const root = await temp()
    await withUpdateLock(root, async () => {
      const owner = await readFile(path.join(root, '.warp-visuals-staging/update.lock'), 'utf8')
      await expect(withUpdateLock(root, async () => {})).rejects.toMatchObject({ code: 'EEXIST' })
      expect(await readFile(path.join(root, '.warp-visuals-staging/update.lock'), 'utf8')).toBe(
        owner,
      )
    })
  })
  it('reads only the locked Git objects despite dirty checkout content and rejects unknown commits', async () => {
    const root = await temp()
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    git('init', '-q')
    await write(root, 'index.json', '{"locked":true}')
    git('add', 'index.json')
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    )
    const commit = git('rev-parse', 'HEAD')
    await write(root, 'index.json', '{"locked":false}')
    const source = await gitSource(root, { ...lock, commit })
    expect(source.read('index.json')?.toString()).toBe('{"locked":true}')
    expect(source.read('missing.png')).toBeUndefined()
    const before = git('status', '--porcelain')
    const nested = path.join(root, 'nested')
    await mkdir(nested)
    await expect(gitSource(nested, { ...lock, commit })).rejects.toThrow(
      'Source must be a Git root',
    )
    await expect(gitSource(root, { ...lock, commit: '0'.repeat(40) })).rejects.toThrow()
    expect(git('status', '--porcelain')).toBe(before)
  })
})
