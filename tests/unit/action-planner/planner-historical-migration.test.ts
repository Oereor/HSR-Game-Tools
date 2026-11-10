import { describe, expect, it } from 'vitest'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  PLANNER_VERSION,
  parsePlannerDocument,
  preparePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import historical from '../../fixtures/action-planner/historical-documents.json'
import { projectHistoricalReplay } from '../../fixtures/action-planner/historical-replay'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

const fixtures = historical.map(({ file, origin, revision, replay }) => ({
  version: file.version,
  file,
  origin,
  revision,
  replay,
}))
const fixtureFor = (version: number) => fixtures.find((fixture) => fixture.version === version)!

describe('historical planner documents', () => {
  it.each(fixtures)(
    'migrates v$version $origin ($revision) and matches its archived replay',
    ({ file, replay, version }) => {
      const raw = JSON.stringify(file)
      const parsed = parsePlannerDocument(raw)
      expect(parsed.migration?.fromVersion).toBe(version)
      expect(parsePlannerDocument(raw)).toStrictEqual(parsed)

      const prepared = preparePlannerDocument(parsed.document, parsed.issues, parsed.migration)
      expect(prepared.migration).toEqual(parsed.migration)
      // Compare the parts of the archived replay independent of the old resource model.
      const { timeline, finalQueue, stopReason, diagnostics } = replay
      expect(projectHistoricalReplay(prepared.result)).toEqual({
        timeline,
        finalQueue,
        stopReason,
        diagnostics: diagnostics.filter((issue) => !issue.code.startsWith('sp-')),
      })
      const canonical = serializePlannerDocument(prepared.document)
      expect(JSON.parse(canonical).version).toBe(PLANNER_VERSION)
      const reopened = parsePlannerDocument(canonical)
      expect(reopened.document).toStrictEqual(prepared.document)
      expect(reopened.migration).toBeUndefined()
      expect(serializePlannerDocument(reopened.document)).toBe(canonical)
      expect(simulatePlan(reopened.document.plan)).toEqual(prepared.result)
    },
  )

  it('reserves legacy orphan references and normalizes resources once when identities are unavailable', () => {
    const doc = syntheticDocument()
    doc.metadata.characterIds['editor-1'] = 'unavailable-character'
    doc.plan.actors[1]!.panelSpeed = 160
    const spawn = doc.plan.events[0]!.operations.find((op) => op.type === 'spawnParticipant')!
    spawn.participant.iconUrl = 'https://example.invalid/summon.png'
    doc.plan.events.push({
      anchor: { kind: 'action', participantId: 'aha-instant', turn: 1 },
      operations: [
        {
          id: 'orphan-advance',
          type: 'advance',
          phase: 'postAction',
          target: { kind: 'participants', participantIds: ['aha-instant:2'] },
          percent: 20,
        },
      ],
    })
    const { aha, ...legacyPlan } = doc.plan
    const input = { ...fixtureFor(2).file, document: { ...doc, plan: legacyPlan } }
    const original = structuredClone(input)
    const parsed = validatePlannerFile(input)
    expect(input).toStrictEqual(original)
    expect(parsed.document.plan.aha).toStrictEqual({ ...aha, id: 'aha-instant:3' })
    expect(parsed.document.plan.events.at(-1)).toStrictEqual(doc.plan.events.at(-1))
    expect(parsed.document.metadata).toStrictEqual(doc.metadata)
    expect(parsed.issues).toEqual([
      { kind: 'unknownElation', id: 'editor-1' },
      { kind: 'missingCharacter', id: 'editor-1' },
      { kind: 'unsafeImage', id: 'spawn:spawn' },
    ])
    const expected = structuredClone(doc)
    expected.plan.aha.id = 'aha-instant:3'
    expected.plan.actors[1]!.panelSpeed = expected.plan.actors[1]!.baseSpeed
    const normalizedSpawn = expected.plan.events[0]!.operations.find(
      (op) => op.type === 'spawnParticipant',
    )!
    delete normalizedSpawn.participant.iconUrl
    expect(parsed.document).toStrictEqual(expected)
    const reopened = parsePlannerDocument(serializePlannerDocument(parsed.document))
    expect(reopened.document).toStrictEqual(expected)
    expect(reopened.issues).toEqual([{ kind: 'missingCharacter', id: 'editor-1' }])
    expect(simulatePlan(reopened.document.plan)).toEqual(simulatePlan(expected.plan))
  })

  it('retains a saved v3 Aha contributor and warns when the character is unavailable', () => {
    const { file } = fixtureFor(3)
    const input = structuredClone(file)
    input.document.metadata.characterIds['editor-1'] = 'unavailable-character'
    const parsed = validatePlannerFile(input)
    expect(parsed.document).toStrictEqual(input.document)
    expect(parsed.issues).toEqual([
      { kind: 'unknownElation', id: 'editor-1' },
      { kind: 'missingCharacter', id: 'editor-1' },
    ])
    const reopened = parsePlannerDocument(serializePlannerDocument(parsed.document))
    expect(reopened.document).toStrictEqual(parsed.document)
    expect(reopened.issues).toEqual(parsed.issues)
    expect(
      simulatePlan(reopened.document.plan).records.some((record) => record.kind === 'aha'),
    ).toBe(true)
  })

  it('rejects a future envelope around a valid historical v9 writer output', () => {
    const { file } = fixtureFor(9)
    expect(() => validatePlannerFile({ ...file, version: PLANNER_VERSION + 1 })).toThrow('version')
  })
})
