import { effectScope, type EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlannerFiles } from '../../../src/tools/action-planner/composables/usePlannerFiles'
import { usePlannerSession } from '../../../src/tools/action-planner/composables/usePlannerSession'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  PLANNER_FORMAT,
} from '../../../src/tools/action-planner/model/document-file'
import type { PlannerDocument } from '../../../src/tools/action-planner/model/editor'
import { STORAGE_KEY } from '../../../src/tools/action-planner/model/persistence'
import historical from '../../fixtures/action-planner/historical-documents.json'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

function skillPointDocument(enabled = false): PlannerDocument {
  const doc = syntheticDocument()
  doc.plan.skillPoints = { enabled, initial: 0, storedMax: 0, maxModifiers: null }
  doc.plan.events[0]!.operations.push(
    { id: 'opening', type: 'restoreSkillPoints', amount: 2, source: 'Opening' },
    {
      id: 'no-storage',
      type: 'restoreSkillPoints',
      amount: 1,
      source: 'Manual',
      storeOverflow: false,
    },
  )
  const action = doc.plan.events[1]!
  action.skill = { kind: 'skill' }
  action.operations.push({
    id: 'refund',
    type: 'conditionalRestore',
    phase: 'postAction',
    amount: 1,
    source: 'Selected refund',
    sourceParticipantId: 'editor-1',
    chance: 0.5,
    cooldownTurns: 0,
    outcome: 'no-proc',
  })
  doc.plan.events.push({
    anchor: { kind: 'action', participantId: 'editor-1', turn: 2 },
    skill: { kind: 'custom', cost: 0, recovery: 0 },
    operations: [],
  })
  return doc
}

const envelope = (document: PlannerDocument, version = 9) => ({
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

describe('Action Planner file and session integration', () => {
  it('imports v9, exports the committed document, and reopens and autosaves it as v9', async () => {
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
      const invalid = error === 'json' ? '{' : JSON.stringify(envelope(skillPointDocument(), 10))
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

  it('reloads an external v9 plan with reader normalization and leaves its raw bytes intact', () => {
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

  it('reloads a historical v8 fixture and keeps its bytes and migration notice', () => {
    const { file } = historical.find(({ file }) => file.version === 8)!
    const raw = JSON.stringify(file)
    const space = workspace(JSON.stringify(envelope(syntheticDocument())))
    const { files, planner, download, saveStatus } = space.open()
    space.externalChange(raw)
    files.reload()
    files.confirm()
    expect(planner.document.value).toStrictEqual(file.document)
    expect(planner.migrationNotice.value).toEqual({ fromVersion: 8, ahaAdded: false })
    expect(saveStatus.value).toBe('saved')
    files.exportFile()
    expect(JSON.parse(download.mock.calls[0]![0])).toStrictEqual({ ...file, version: 9 })
    expect(space.store.raw).toBe(raw)
    expect(space.store.writes).toBe(0)
  })

  it('loads a v9 template through the confirmed replacement and storage path', () => {
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

  it.each(['settings', 'skill-only event', 'uncommitted input'])(
    'requires confirmation before replacing a plan with %s',
    (content) => {
      const expected = emptyDocument()
      if (content === 'settings') expected.plan.skillPoints = { enabled: false }
      if (content === 'skill-only event')
        expected.plan.events.push({
          anchor: { kind: 'action', participantId: 'retired-actor', turn: 1 },
          skill: { kind: 'basic' },
          operations: [],
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

  it('retries a failed save with the complete v9 document', () => {
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
    const future = JSON.stringify(envelope(expected, 10), null, 1) + '\n'
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
