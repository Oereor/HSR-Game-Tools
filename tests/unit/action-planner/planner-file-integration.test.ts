import { effectScope, type EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlannerFiles } from '../../../src/tools/action-planner/composables/usePlannerFiles'
import { usePlannerSession } from '../../../src/tools/action-planner/composables/usePlannerSession'
import { anchorKey, simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  FILE_LIMITS,
  parsePlannerDocument,
  PLANNER_FORMAT,
  PLANNER_VERSION,
  preparePlannerDocument,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import type { EventAnchor } from '../../../src/tools/action-planner/engine/types'
import type { PlannerDocument } from '../../../src/tools/action-planner/model/editor'
import { STORAGE_KEY } from '../../../src/tools/action-planner/model/persistence'
import { presets } from '../../../src/tools/action-planner/presets/catalog'
import historical from '../../fixtures/action-planner/historical-documents.json'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

function skillPointDocument(enabled = false): PlannerDocument {
  const doc = syntheticDocument()
  doc.plan.skillPoints = { enabled, initial: 0, max: 6 }
  doc.plan.events[0]!.operations.push({ id: 'opening', type: 'changeSkillPoints', amount: 2 })
  doc.plan.events[1]!.operations.push({
    id: 'spend',
    type: 'changeSkillPoints',
    amount: -3,
    phase: 'preAction',
  })
  return doc
}

const envelope = (document: unknown, version: number = PLANNER_VERSION) => ({
  format: PLANNER_FORMAT,
  version,
  document,
})
const upload = (source: string) => new File([source], 'plan.json', { type: 'application/json' })
const scopes: EffectScope[] = []

function workspace(raw: string | null = null) {
  const store = {
    raw,
    writes: 0,
    failWrite: false,
    getItem(key: string) {
      expect(key).toBe(STORAGE_KEY)
      return this.raw
    },
    setItem(key: string, value: string) {
      expect(key).toBe(STORAGE_KEY)
      if (this.failWrite) throw new Error('QuotaExceededError')
      this.raw = value
      this.writes++
    },
  }
  const window = Object.assign(new EventTarget(), { localStorage: store })
  vi.stubGlobal('window', window)
  return {
    store,
    externalChange(next: string) {
      store.raw = next
      window.dispatchEvent(
        Object.assign(new Event('storage'), {
          key: STORAGE_KEY,
          newValue: next,
          storageArea: store,
        }),
      )
    },
    open(hasUncommittedInput = () => false) {
      const scope = effectScope()
      scopes.push(scope)
      const session = scope.run(() => usePlannerSession())!
      const download = vi.fn<(source: string, filename: string) => void>()
      const files = usePlannerFiles(session, hasUncommittedInput, download)
      return { ...session, files, download, close: () => scope.stop() }
    },
  }
}

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.unstubAllGlobals()
})

type Workspace = ReturnType<typeof workspace>
type Session = ReturnType<Workspace['open']>

async function verifyRoundTrip(space: Workspace, app: Session, authored: PlannerDocument) {
  const prepared = preparePlannerDocument(authored)
  const { document, result } = app.planner
  expect(document.value).toStrictEqual(prepared.document)
  expect(result.value).toStrictEqual(prepared.result)
  app.files.exportFile()
  const [bytes] = app.download.mock.calls.at(-1)!
  expect(JSON.parse(bytes)).toStrictEqual(envelope(prepared.document))
  expect(bytes).toBe(serializePlannerDocument(document.value))
  expect(space.store.raw).toBe(bytes)

  const writes = space.store.writes
  app.close()
  const reopened = space.open()
  expect(space.store.writes).toBe(writes)
  expect(reopened.planner.document.value).toStrictEqual(prepared.document)
  expect(reopened.planner.result.value).toStrictEqual(prepared.result)
  expect(reopened.planner.migrationNotice.value).toBeUndefined()
  await reopened.files.importFile(upload(bytes))
  expect(reopened.files.pending.value?.kind).toBe('replace')
  expect(reopened.files.error.value).toBeUndefined()
  expect(space.store.writes).toBe(writes)
  reopened.files.confirm()
  expect(space.store.writes).toBe(writes + 1)
  expect(reopened.planner.document.value).toStrictEqual(prepared.document)
  expect(reopened.planner.result.value).toStrictEqual(prepared.result)
  reopened.files.exportFile()
  expect(reopened.download.mock.calls.at(-1)?.[0]).toBe(bytes)
  expect(space.store.raw).toBe(bytes)
}

const start: EventAnchor = { kind: 'start' }
const action = (turn: number, participantId = 'a'): EventAnchor => ({
  kind: 'action',
  participantId,
  turn,
})
function resourcePlan() {
  const doc = emptyDocument()
  doc.name = 'Skill Point lifecycle'
  doc.plan.actors = [
    {
      id: 'a',
      name: 'A',
      kind: 'actor',
      camp: 'ally',
      position: 0,
      baseSpeed: 100,
      panelSpeed: 100,
    },
    { id: 'b', name: 'B', kind: 'actor', camp: 'ally', position: 1, baseSpeed: 10, panelSpeed: 10 },
  ]
  doc.plan.maxNodes = 5
  doc.plan.maxAV = 600
  return doc
}

describe('Skill point document lifecycle', () => {
  it('edits, reorders and reopens signed changes with stable operation identities', async () => {
    const authored = skillPointDocument(true)
    const space = workspace()
    const app = space.open()
    await app.files.importFile(upload(serializePlannerDocument(authored)))
    const planner = app.planner
    const event = authored.plan.events[1]!
    planner.select(event.anchor)
    const spend = planner.operations.value.find((op) => op.id === 'spend')!
    planner.edit(spend)
    expect(planner.preview.value?.skillPoints?.current).toBe(2n)
    planner.draft.value!.amount = -4
    expect(planner.submit()).toBe(true)
    expect(planner.operations.value.find((op) => op.id === spend.id)).toMatchObject({ amount: -4 })
    expect(planner.result.value.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'sp-negative-first',
        anchor: event.anchor,
        operationId: spend.id,
      }),
    )
    planner.addSkillPoints('preAction')
    expect(planner.draft.value?.amount).toBe(0)
    expect(planner.preview.value?.skillPoints?.current).toBe(-2n)
    planner.draft.value!.amount = 6
    expect(planner.submit()).toBe(true)
    const gain = planner.operations.value.find(
      (op) => op.type === 'changeSkillPoints' && op.amount === 6,
    )!
    const settled = () => {
      const result = planner.result.value
      const index = result.records.findIndex(
        (node) => anchorKey(node.anchor) === anchorKey(event.anchor),
      )
      return result.snapshots[index + 1]?.skillPoints?.current
    }
    expect(settled()).toBe(4n)
    planner.move(gain.id, -1)
    expect(settled()).toBe(2n)
    expect(planner.result.value.diagnostics.some((d) => d.code === 'sp-negative-first')).toBe(false)
    await verifyRoundTrip(space, app, planner.document.value)
  })

  it.each(['robin-summeretto-fever', 'robin-ultimate', 'firefly-ultimate'])(
    'saves and reopens %s alongside authored SP operations',
    async (id) => {
      const preset = presets.find((item) => item.id === id)!
      const authored = resourcePlan()
      authored.metadata.characterIds = { a: preset.characterId! }
      authored.plan.actors[1]!.panelSpeed = 160
      authored.plan.actors.push({
        id: 'enemy',
        name: 'Enemy',
        kind: 'actor',
        camp: 'enemy',
        category: 'enemy',
        position: 0,
        baseSpeed: 80,
        panelSpeed: 80,
      })
      authored.plan.skillPoints = { enabled: true, initial: 3 }
      authored.plan.events = [
        {
          anchor: start,
          operations: [{ id: 'opening', type: 'changeSkillPoints', amount: 1 }],
        },
        {
          anchor: action(1, 'b'),
          operations: [
            {
              id: 'spend',
              type: 'changeSkillPoints',
              phase: 'postAction',
              amount: -1,
            },
          ],
        },
      ]
      const space = workspace()
      const app = space.open()
      await app.files.importFile(upload(JSON.stringify(envelope(authored))))
      const p = app.planner
      p.edit()
      expect(p.submitPreset({ id, values: {}, translate: (key) => key })).toBe(true)
      expect(p.plan.value.events[0]?.operations[0]).toStrictEqual(
        authored.plan.events[0]!.operations[0],
      )
      expect(p.plan.value.events[1]).toStrictEqual(authored.plan.events[1])
      expect(p.plan.value.events[0]!.operations.length).toBeGreaterThan(1)
      expect(p.result.value.diagnostics.filter((issue) => issue.severity === 'error')).toEqual([])
      const timeline = (result: ReturnType<typeof simulatePlan>) =>
        result.records.map(({ anchor, deltaAV, elapsedAV }) => ({ anchor, deltaAV, elapsedAV }))
      expect(timeline(p.result.value)).toStrictEqual(
        timeline(
          simulatePlan({
            ...p.plan.value,
            skillPoints: { enabled: false },
          }),
        ),
      )
      await verifyRoundTrip(space, app, p.document.value)
    },
  )
})

describe('Action Planner file and session integration', () => {
  it('protects compact startup bytes when canonical export and import would exceed the limit', async () => {
    const input = syntheticDocument()
    input.metadata.customNames = {}
    const participantId = input.plan.actors[0]!.id
    const ids = Array.from(
      { length: FILE_LIMITS.targets },
      (_, i) => `missing-${String(i).padStart(3, '0')}`,
    )
    input.plan.events = Array.from({ length: 500 }, (_, i) => ({
      anchor: { kind: 'action', participantId, turn: i + 1 },
      operations: [
        {
          id: `advance-${i}`,
          type: 'advance',
          phase: 'preAction',
          percent: 10,
          target: { kind: 'participants', participantIds: ids },
        },
      ],
    }))
    const bytes = JSON.stringify(envelope(input))
    expect(new TextEncoder().encode(bytes).length).toBeLessThan(FILE_LIMITS.bytes)
    expect(parsePlannerDocument(bytes).document.plan.events).toHaveLength(500)
    expect(() => serializePlannerDocument(input)).toThrow('limit')

    const space = workspace(bytes)
    const { planner, persistence, saveStatus, files, download } = space.open()
    expect(saveStatus.value).toBe('protected')
    expect(persistence.failure).toBe('limit')
    expect(planner.document.value).toEqual(emptyDocument())
    const restore = vi.fn(() => true)
    expect(persistence.reload(restore)).toBe(false)
    expect(restore).not.toHaveBeenCalled()
    expect(persistence.failure).toBe('limit')
    expect(planner.rename('Local draft')).toBe(true)
    const before = planner.document.value
    await files.importFile(upload(bytes))
    expect(files.error.value).toBe('limit')
    expect(files.pending.value).toBeUndefined()
    expect(planner.document.value).toBe(before)
    expect(space.store.raw).toBe(bytes)
    expect(space.store.writes).toBe(0)
    files.backupRaw()
    expect(download).toHaveBeenCalledWith(bytes, 'action-planner-storage-backup.json')
    expect(space.store.raw).toBe(bytes)

    const smaller = { ...input, plan: { ...input.plan, events: input.plan.events.slice(0, 100) } }
    const exportable = serializePlannerDocument(smaller)
    await files.importFile(upload(exportable))
    expect(files.pending.value?.kind).toBe('replace')
    expect(space.store.raw).toBe(bytes)
    files.confirm()
    expect(planner.document.value).toStrictEqual(smaller)
    expect(space.store.raw).toBe(exportable)
    expect(space.store.writes).toBe(1)
  })

  it('imports v10, exports the committed document, and reopens and autosaves it', async () => {
    const expected = skillPointDocument()
    const space = workspace()
    const app = space.open()
    await app.files.importFile(upload(JSON.stringify(envelope(expected))))
    expect(app.files.error.value).toBeUndefined()
    expect(app.planner.document.value).toStrictEqual(expected)
    expect(app.planner.result.value).toEqual(simulatePlan(expected.plan))
    expect(space.store.writes).toBe(1)

    app.files.exportFile()
    const [exported, filename] = app.download.mock.calls[0]!
    expect(filename).toBe('Synthetic fixture.json')
    expect(JSON.parse(exported)).toStrictEqual(envelope(expected))
    expect(space.store.raw).toBe(exported)
    expect(space.store.writes).toBe(1)
    app.close()
    expect(space.store.writes).toBe(1)

    space.store.raw = exported
    const reopened = space.open()
    expect(reopened.planner.document.value).toStrictEqual(expected)
    expect(reopened.planner.result.value).toEqual(simulatePlan(expected.plan))
    expect(space.store.writes).toBe(1)
    expect(reopened.planner.rename('Saved again')).toBe(true)
    expect(space.store.writes).toBe(2)
    expect(JSON.parse(space.store.raw!)).toStrictEqual(
      envelope({ ...expected, name: 'Saved again' }),
    )
    reopened.close()
    expect(space.open().planner.document.value).toStrictEqual({ ...expected, name: 'Saved again' })
    expect(space.store.writes).toBe(2)
  })

  it.each(['json', 'version'])(
    'keeps the active document and stored bytes on a %s import error',
    async (error) => {
      const original = JSON.stringify(envelope(skillPointDocument()))
      const { store, open } = workspace(original)
      const { planner, files } = open()
      const active = planner.document.value
      const result = planner.result.value
      planner.edit()
      const draft = planner.draft.value
      const invalid = error === 'json' ? '{' : JSON.stringify(envelope(skillPointDocument(), 11))
      await files.importFile(upload(invalid))
      expect(files.error.value).toBe(error)
      expect(files.pending.value).toBeUndefined()
      expect(files.busy.value).toBe(false)
      expect(planner.document.value).toBe(active)
      expect(planner.result.value).toBe(result)
      expect(planner.draft.value).toBe(draft)
      expect(store.raw).toBe(original)
      expect(store.writes).toBe(0)
    },
  )

  it('imports a v3 file without enabling skill points or changing its replay', async () => {
    const expected = syntheticDocument()
    const { store, open } = workspace()
    const { planner, files } = open()
    await files.importFile(upload(JSON.stringify(envelope(expected, 3))))
    expect(planner.migrationNotice.value).toEqual({ fromVersion: 3, ahaAdded: false })
    expect(planner.document.value).toStrictEqual(expected)
    expect(planner.result.value).toEqual(simulatePlan(expected.plan))
    expect(JSON.parse(store.raw!)).toStrictEqual(envelope(expected))
    expect(store.writes).toBe(1)
  })

  it('reloads an external v10 plan with reader normalization and leaves its raw bytes intact', () => {
    const expected = skillPointDocument(true)
    const input = structuredClone(expected)
    input.plan.actors[1]!.panelSpeed = 160
    const spawn = input.plan.events[0]!.operations.find((op) => op.type === 'spawnParticipant')!
    spawn.participant.iconUrl = 'https://example.invalid/icon'
    const raw = JSON.stringify(envelope(input))
    const space = workspace(JSON.stringify(envelope(syntheticDocument())))
    const { planner, files, download, saveStatus } = space.open()
    const before = planner.document.value
    space.externalChange(raw)
    expect(saveStatus.value).toBe('external')
    files.reload()
    expect(files.pending.value?.kind).toBe('reload')
    expect(planner.document.value).toBe(before)
    files.confirm()
    expect(planner.document.value).toStrictEqual(expected)
    expect(planner.resourceIssues.value).toContainEqual({ kind: 'unsafeImage', id: 'spawn:spawn' })
    expect(planner.result.value).toEqual(simulatePlan(expected.plan))
    expect(saveStatus.value).toBe('saved')
    files.exportFile()
    expect(JSON.parse(download.mock.calls[0]![0])).toStrictEqual(envelope(expected))
    expect(space.store.raw).toBe(raw)
    expect(space.store.writes).toBe(0)
  })

  it('protects a lossy local v9 migration through cancel, changed bytes and write failure', () => {
    const { file } = historical.find(({ file }) => file.version === 9)!
    const raw = JSON.stringify(file)
    const space = workspace(raw)
    const { files, planner, persistence, saveStatus, download } = space.open()
    expect(saveStatus.value).toBe('protected')
    expect(persistence.failure).toBe('migrationRequired')
    const before = planner.document.value
    files.reload()
    expect(files.migrationReview.value?.losses).toMatchObject({ conditionalRestore: 3 })
    files.backupMigrationSource()
    expect(download.mock.calls[0]?.[0]).toBe(raw)
    files.pending.value = undefined
    expect(space.store.raw).toBe(raw)
    expect(planner.document.value).toBe(before)

    files.reload()
    space.externalChange(raw + '\n')
    files.confirm()
    expect(files.error.value).toBe('changed')
    expect(space.store.raw).toBe(raw + '\n')
    expect(planner.document.value).toBe(before)

    files.reload()
    space.store.failWrite = true
    files.confirm()
    expect(files.error.value).toBe('migrationWrite')
    expect(planner.document.value).toBe(before)
    expect(space.store.writes).toBe(0)
    expect(space.store.raw).toBe(raw + '\n')
    space.store.failWrite = false
    files.confirm()
    expect(saveStatus.value).toBe('saved')
    expect(space.store.writes).toBe(1)
    expect(planner.migrationNotice.value?.fromVersion).toBe(9)
    expect(space.store.raw).toBe(serializePlannerDocument(planner.document.value))
  })

  it('requires confirmation of lossy file import even in an empty workspace', async () => {
    const { file } = historical.find(({ file }) => file.version === 8)!
    const raw = JSON.stringify(file)
    const space = workspace()
    const { files, planner, download } = space.open()
    await files.importFile(upload(raw))
    expect(space.store.raw).toBeNull()
    expect(planner.document.value).toEqual(emptyDocument())
    expect(files.migrationReview.value?.losses).toMatchObject({ dynamicMax: 1, storage: 2 })
    files.backupMigrationSource()
    expect(download.mock.calls[0]?.[0]).toBe(raw)
    files.confirm()
    expect(planner.document.value).toEqual(parsePlannerDocument(raw).document)
    expect(space.store.raw).toBe(serializePlannerDocument(planner.document.value))
  })

  it('loads a v10 template through the confirmed replacement and storage path', () => {
    const space = workspace(JSON.stringify(envelope(syntheticDocument())))
    const { files, planner } = space.open()
    const expected = skillPointDocument()
    const template = {
      id: 'synthetic-test-only',
      order: 0,
      nameKey: 'test.name',
      descriptionKey: 'test.description',
      file: envelope(expected),
    }
    expect(files.useTemplate(template)).toBe(true)
    expect(files.pending.value?.kind).toBe('replace')
    expect(planner.document.value).toStrictEqual(syntheticDocument())
    expect(space.store.writes).toBe(0)
    files.confirm()
    expect(planner.document.value).toStrictEqual(expected)
    expect(planner.document.value).not.toBe(expected)
    expect(JSON.parse(space.store.raw!)).toStrictEqual(envelope(expected))
    expect(space.store.writes).toBe(1)
  })

  it.each(['settings', 'skill point operation', 'uncommitted input'])(
    'requires confirmation before replacing a plan with %s',
    (content) => {
      const expected = emptyDocument()
      if (content === 'settings') expected.plan.skillPoints = { enabled: false }
      if (content === 'skill point operation')
        expected.plan.events.push({
          anchor: { kind: 'action', participantId: 'retired-actor', turn: 1 },
          operations: [{ id: 'sp', type: 'changeSkillPoints', phase: 'postAction', amount: 1 }],
        })
      const raw = JSON.stringify(envelope(expected))
      const { store, open } = workspace(raw)
      const { files, planner } = open(() => content === 'uncommitted input')
      const before = planner.document.value
      files.newDocument()
      expect(files.pending.value?.kind).toBe('replace')
      expect(planner.document.value).toBe(before)
      expect(store.raw).toBe(raw)
      expect(store.writes).toBe(0)
      files.pending.value = undefined
      expect(planner.document.value).toBe(before)
      expect(store.raw).toBe(raw)
    },
  )

  it('retries a failed save with the complete v10 document', () => {
    const expected = skillPointDocument()
    const original = JSON.stringify(envelope(expected))
    const { store, open } = workspace(original)
    const { files, planner, saveStatus } = open()
    store.failWrite = true
    expect(planner.rename('Pending save')).toBe(true)
    expect(saveStatus.value).toBe('failed')
    expect(store.raw).toBe(original)
    store.failWrite = false
    files.retry()
    expect(saveStatus.value).toBe('saved')
    expect(JSON.parse(store.raw!)).toStrictEqual(envelope({ ...expected, name: 'Pending save' }))
    expect(store.writes).toBe(1)
  })

  it('protects future storage, backs up the exact bytes, and requires a current overwrite token', () => {
    const expected = skillPointDocument()
    const space = workspace(JSON.stringify(envelope(expected)))
    const { files, planner, download, saveStatus } = space.open()
    const future = JSON.stringify(envelope(expected, 11), null, 1) + '\n'
    space.externalChange(future)
    files.reload()
    expect(files.error.value).toBe('version')
    expect(files.pending.value).toBeUndefined()
    expect(planner.document.value).toStrictEqual(expected)
    files.backupRaw()
    expect(download).toHaveBeenCalledWith(future, 'action-planner-storage-backup.json')
    expect(planner.rename('Recovery plan')).toBe(true)
    expect(space.store.raw).toBe(future)
    expect(space.store.writes).toBe(0)
    files.overwrite()
    expect(files.pending.value?.kind).toBe('overwrite')
    space.externalChange(future + '\n')
    files.confirm()
    expect(files.error.value).toBe('changed')
    expect(space.store.raw).toBe(future + '\n')
    expect(space.store.writes).toBe(0)
    files.overwrite()
    files.confirm()
    expect(saveStatus.value).toBe('saved')
    expect(JSON.parse(space.store.raw!)).toStrictEqual(
      envelope({ ...expected, name: 'Recovery plan' }),
    )
    expect(space.store.writes).toBe(1)
  })
})
