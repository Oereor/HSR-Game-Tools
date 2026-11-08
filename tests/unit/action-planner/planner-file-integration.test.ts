import { effectScope, type EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlannerFiles } from '../../../src/tools/action-planner/composables/usePlannerFiles'
import { usePlannerSession } from '../../../src/tools/action-planner/composables/usePlannerSession'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  parsePlannerDocument,
  PLANNER_FORMAT,
  preparePlannerDocument,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import type { EffectOperation, EventAnchor } from '../../../src/tools/action-planner/engine/types'
import type { PlannerDocument } from '../../../src/tools/action-planner/model/editor'
import { STORAGE_KEY } from '../../../src/tools/action-planner/model/persistence'
import { buildSkillPointLedger } from '../../../src/tools/action-planner/model/skill-point-ledger'
import { presets } from '../../../src/tools/action-planner/presets/catalog'
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

type Workspace = ReturnType<typeof workspace>
type Session = ReturnType<Workspace['open']>

async function verifyRoundTrip(space: Workspace, app: Session, authored: PlannerDocument) {
  const prepared = preparePlannerDocument(authored)
  const { document, result } = app.planner
  expect(document.value).toStrictEqual(prepared.document)
  expect(result.value).toStrictEqual(prepared.result)
  const ledger = buildSkillPointLedger(result.value, document.value.plan.cycleMode)
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
  expect(buildSkillPointLedger(reopened.planner.result.value, authored.plan.cycleMode)).toEqual(
    ledger,
  )

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

describe('Skill Point document lifecycle', () => {
  it.each([3, 7, 8])('imports, edits and reopens the archived v%s document', async (version) => {
    const file = historical.find((entry) => entry.file.version === version)!.file
    const source = JSON.stringify(file)
    const parsed = parsePlannerDocument(source)
    const space = workspace()
    const app = space.open()
    await app.files.importFile(upload(source))
    expect(app.planner.migrationNotice.value).toEqual({ fromVersion: version, ahaAdded: false })
    expect(app.planner.document.value).toStrictEqual(file.document)
    expect(app.planner.result.value).toStrictEqual(simulatePlan(parsed.document.plan))
    expect(space.store.writes).toBe(1)

    const expected = structuredClone(parsed.document)
    const first = expected.plan.events[0]!.operations[0]!
    const p = app.planner
    p.select(start)
    p.edit(p.operations.value[0])
    if (first.type === 'advance') {
      first.percent += 10
      p.draft.value!.percent = first.percent
      expect(expected.plan).not.toHaveProperty('skillPoints')
    } else if (first.type === 'restoreSkillPoints') {
      first.amount += 1
      p.draft.value!.amount = first.amount
      if (version === 7) expect(expected.plan.skillPoints).not.toHaveProperty('maxModifiers')
    } else {
      throw new Error('Unexpected historical opening operation')
    }
    expect(p.submit()).toBe(true)
    expect(space.store.writes).toBe(2)
    await verifyRoundTrip(space, app, expected)
  })

  it('edits both target-free operations and replays skills, cooldowns, cap changes and storage', async () => {
    const authored = resourcePlan()
    authored.plan.skillPoints = {
      enabled: true,
      initial: 7,
      max: 5,
      storedMax: 4,
      maxModifiers: [{ amount: 2, sourceParticipantId: 'b' }],
    }
    const presence = (id: string, type: 'depart' | 'returnToField'): EffectOperation => ({
      id,
      type,
      phase: 'postAction',
      target: { kind: 'participants', participantIds: ['b'] },
    })
    const depart = presence('leave', 'depart')
    const returnToField = presence('return', 'returnToField')
    const leaveAgain = presence('leave-again', 'depart')
    authored.plan.events = [
      { anchor: action(1), operations: [depart], skill: { kind: 'skill' } },
      { anchor: action(2), operations: [returnToField], skill: { kind: 'skill' } },
      { anchor: action(5), operations: [leaveAgain] },
    ]
    const space = workspace()
    const app = space.open()
    await app.files.importFile(upload(JSON.stringify(envelope(authored))))
    const p = app.planner
    expect(p.document.value).toStrictEqual(authored)
    p.edit()
    Object.assign(p.draft.value!, {
      type: 'restoreSkillPoints',
      amount: 3,
      source: 'Opening reserve',
      storeOverflow: false,
    })
    expect(p.submit()).toBe(true)
    const openingId = p.operations.value[0]!.id
    p.edit(p.operations.value[0])
    expect(p.draft.value?.amount).toBe(3)
    p.draft.value!.amount = 4
    p.draft.value!.storeOverflow = true
    expect(p.submit()).toBe(true)
    const opening: EffectOperation = {
      id: openingId,
      type: 'restoreSkillPoints',
      amount: 4,
      source: 'Opening reserve',
      storeOverflow: true,
    }
    expect(p.operations.value).toStrictEqual([opening])
    p.edit()
    Object.assign(p.draft.value!, { type: 'restoreSkillPoints', amount: 1, source: 'Temporary' })
    expect(p.submit()).toBe(true)
    p.remove(p.operations.value[1]!.id)
    expect(p.operations.value).toStrictEqual([opening])

    const addRefund = (turn: number) => {
      p.select(action(turn))
      p.edit()
      Object.assign(p.draft.value!, {
        type: 'conditionalRestore',
        phase: 'preAction',
        amount: 1,
        source: 'Manual refund',
        chance: 0.5,
        cooldownTurns: 1,
        outcome: 'proc',
      })
      const before = p.document.value
      const writes = space.store.writes
      expect(p.submit()).toBe(false)
      expect(p.document.value).toBe(before)
      expect(space.store.writes).toBe(writes)
      p.draft.value!.phase = 'postAction'
      expect(p.submit()).toBe(true)
      const operation = p.operations.value.at(-1)!
      expect(operation).toMatchObject({ type: 'conditionalRestore', sourceParticipantId: 'a' })
      expect(operation).not.toHaveProperty('target')
      return operation
    }
    const firstRefund = addRefund(1)
    p.edit(firstRefund)
    p.draft.value!.chance = 0.75
    expect(p.submit()).toBe(true)
    const refund = { ...firstRefund, chance: 0.75 }
    p.move(firstRefund.id, -1)
    expect(p.operations.value).toStrictEqual([refund, depart])
    const secondRefund = addRefund(2)
    p.select(action(3))
    expect(p.setSkill({ kind: 'skill' })).toBe(true)
    const thirdRefund = addRefund(3)
    p.select(action(4))
    expect(p.setSkill({ kind: 'skill' })).toBe(true)
    const temporary = addRefund(4)
    p.remove(temporary.id)
    expect(p.skill.value).toStrictEqual({ kind: 'skill' })
    expect(p.operations.value).toEqual([])
    expect(p.setSkill({ kind: 'basic' })).toBe(true)
    expect(p.skill.value).toStrictEqual({ kind: 'basic' })
    const basic = p.result.value.records[3]
    expect(basic).toMatchObject({ skillPoints: { paid: 0, recovery: 0 } })
    const skill = { kind: 'custom', cost: 2, recovery: 1 } as const
    expect(p.setSkill(skill)).toBe(true)

    authored.plan.events = [
      { anchor: action(1), operations: [refund, depart], skill: { kind: 'skill' } },
      { anchor: action(2), operations: [returnToField, secondRefund], skill: { kind: 'skill' } },
      { anchor: action(5), operations: [leaveAgain] },
      { anchor: start, operations: [opening] },
      { anchor: action(3), operations: [thirdRefund], skill: { kind: 'skill' } },
      { anchor: action(4), operations: [], skill },
    ]
    const result = p.result.value
    expect(result.startSkillPointEvents?.[0]).toMatchObject({ restored: 0, stored: 4 })
    expect(result.records.map((record) => record.conditionalRestores?.[0]?.status)).toEqual([
      'proc',
      'cooldown',
      'proc',
      undefined,
      undefined,
    ])
    expect(result.records[0]?.maxChanges?.[0]).toMatchObject({ beforeMax: 7, afterMax: 5, loss: 2 })
    expect(result.records[1]?.refill).toMatchObject({ amount: 3, storedAfter: 1 })
    expect(result.records[3]).toMatchObject({
      skillPoints: { paid: 2, recovery: 1 },
      refill: { amount: 1, storedAfter: 0 },
    })
    expect(result.records[4]?.maxChanges?.[0]).toMatchObject({
      before: null,
      after: null,
      loss: null,
    })
    expect(buildSkillPointLedger(result, 'none')).toMatchObject([
      { openingBalance: 7, endingBalance: null, storedBalance: 0, endingMax: 5, capLoss: null },
    ])
    await verifyRoundTrip(space, app, authored)
  })

  it('keeps a blocked plan editable and preserves null modifiers through setup and reopen', async () => {
    const authored = resourcePlan()
    authored.plan.maxNodes = 2
    authored.plan.skillPoints = { enabled: true, initial: 1, storedMax: 0, maxModifiers: null }
    const refund: EffectOperation = {
      id: 'refund',
      type: 'conditionalRestore',
      phase: 'postAction',
      source: 'Manual',
      sourceParticipantId: 'a',
      amount: 1,
      chance: 0.5,
      cooldownTurns: 1,
      outcome: 'no-proc',
    }
    authored.plan.events = [
      { anchor: action(1), operations: [refund], skill: { kind: 'skill' } },
      { anchor: action(2), operations: [], skill: { kind: 'skill' } },
    ]
    const space = workspace()
    const app = space.open()
    await app.files.importFile(upload(JSON.stringify(envelope(authored))))
    const p = app.planner
    expect(p.result.value.blockedAction?.anchor).toEqual(action(2))
    p.select(action(2))
    p.edit()
    Object.assign(p.draft.value!, {
      type: 'restoreSkillPoints',
      phase: 'preAction',
      amount: 1,
      source: 'Repair',
      storeOverflow: false,
    })
    expect(p.preview.value?.skillPoints?.current).toBe(0)
    const before = p.document.value
    const replay = p.result.value
    const draft = p.draft.value
    const writes = space.store.writes
    const bytes = space.store.raw
    expect(p.replacePlan({ ...authored.plan, maxNodes: 0 })).toBe(false)
    await app.files.importFile(upload('{'))
    expect(app.files.error.value).toBe('json')
    expect(p.document.value).toBe(before)
    expect(p.result.value).toBe(replay)
    expect(p.draft.value).toBe(draft)
    expect(p.selected.value).toEqual(action(2))
    expect(space.store.raw).toBe(bytes)
    expect(space.store.writes).toBe(writes)

    expect(p.submit()).toBe(true)
    expect(p.result.value.blockedAction).toBeUndefined()
    authored.plan.events[1]!.operations = [
      {
        id: p.operations.value[0]!.id,
        type: 'restoreSkillPoints',
        phase: 'preAction',
        amount: 1,
        source: 'Repair',
      },
    ]
    const config = { ...authored.plan.skillPoints, onInsufficient: 'mark' as const }
    expect(p.applySetup(authored.plan.actors, 2, 600, {}, 'none', authored.plan.aha, config)).toBe(
      true,
    )
    authored.plan.skillPoints = config
    expect(p.result.value.skillPointsSummary?.endingBalance).toBe(0)
    await verifyRoundTrip(space, app, authored)
  })

  it('commits a reviewed batch once and reopens it with stable operation and event identities', async () => {
    const authored = resourcePlan()
    authored.plan.maxNodes = 2
    authored.plan.skillPoints = { enabled: true }
    authored.plan.events = [
      {
        anchor: action(1),
        skill: { kind: 'skill' },
        operations: [
          {
            id: 'keep',
            type: 'advance',
            phase: 'postAction',
            percent: 10,
            target: { kind: 'participants', participantIds: ['b'] },
          },
        ],
      },
      { anchor: action(99), skill: { kind: 'custom', cost: 0, recovery: 0 }, operations: [] },
    ]
    authored.metadata.customNames.keep = 'Keep'
    const space = workspace()
    const app = space.open()
    await app.files.importFile(upload(JSON.stringify(envelope(authored))))
    const p = app.planner
    const cancelled = p.reviewBatchSkills({ scope: 'all' }, { kind: 'basic' })
    p.cancelBatchSkills()
    expect(p.confirmBatchSkills(cancelled)).toBe(false)
    expect(space.store.writes).toBe(1)
    const reviewed = p.reviewBatchSkills({ scope: 'all' }, { kind: 'basic' })
    expect(reviewed.overwriteCount).toBe(1)
    expect(reviewed.changes).toStrictEqual([action(1), action(2)])
    expect(p.confirmBatchSkills(reviewed)).toBe(true)
    expect(space.store.writes).toBe(2)
    authored.plan.events[0]!.skill = { kind: 'basic' }
    authored.plan.events.push({ anchor: action(2), skill: { kind: 'basic' }, operations: [] })
    expect(p.result.value.skillPointsSummary?.endingBalance).toBe(5)
    await verifyRoundTrip(space, app, authored)
  })

  it.each(['robin-summeretto-fever', 'robin-ultimate', 'firefly-ultimate'])(
    'saves and reopens %s alongside authored SP operations and skills',
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
      authored.plan.skillPoints = { enabled: true, initial: 3, onInsufficient: 'mark' }
      authored.plan.events = [
        {
          anchor: start,
          operations: [{ id: 'opening', type: 'restoreSkillPoints', source: 'Opening', amount: 1 }],
        },
        {
          anchor: action(1, 'b'),
          skill: { kind: 'skill' },
          operations: [
            {
              id: 'refund',
              type: 'conditionalRestore',
              phase: 'postAction',
              amount: 1,
              source: 'Manual',
              sourceParticipantId: 'b',
              chance: 0.5,
              cooldownTurns: 0,
              outcome: 'proc',
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
