import { describe, expect, it } from 'vitest'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
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
      const expected = {
        ...file.document,
        plan: {
          ...file.document.plan,
          ...(version === 1 ? { cycleMode: 'none' } : {}),
          ...(version < 3 ? { aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] } } : {}),
        },
      }
      expect(parsed.document).toStrictEqual(expected)
      expect(parsed.migration).toEqual(
        version < 9 ? { fromVersion: version, ahaAdded: false } : undefined,
      )
      expect(parsePlannerDocument(raw)).toStrictEqual(parsed)
      if (version < 4) expect(Object.hasOwn(parsed.document.plan, 'skillPoints')).toBe(false)

      const prepared = preparePlannerDocument(parsed.document, parsed.issues, parsed.migration)
      expect(prepared.document).toStrictEqual(expected)
      expect(prepared.migration).toEqual(parsed.migration)
      expect(JSON.parse(JSON.stringify(projectHistoricalReplay(prepared.result)))).toEqual(replay)
      const canonical = serializePlannerDocument(prepared.document)
      expect(JSON.parse(canonical)).toStrictEqual({ ...file, version: 9, document: expected })
      const reopened = parsePlannerDocument(canonical)
      expect(reopened.document).toStrictEqual(expected)
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

  it.each([8, 9])(
    'preserves omitted, null and empty max modifiers distinctly in v%i',
    (version) => {
      const { file } = fixtureFor(version)
      const doc = parsePlannerDocument(JSON.stringify(file)).document
      const config = doc.plan.skillPoints!
      delete config.maxModifiers
      const results = [
        doc,
        ...[null, []].map((maxModifiers) => ({
          ...doc,
          plan: { ...doc.plan, skillPoints: { ...config, maxModifiers } },
        })),
      ].map((document) => {
        const migrated = validatePlannerFile({ ...file, document }).document
        const reopened = parsePlannerDocument(serializePlannerDocument(migrated)).document
        expect(reopened).toStrictEqual(document)
        return simulatePlan(reopened.plan)
      })
      expect(results[1]).toEqual(results[0])
      expect(results[2]).toEqual(results[0])
    },
  )

  it.each(['missing', 'enemy'])('rejects a v8 cap modifier with a %s source', (id) => {
    const { file } = fixtureFor(8)
    const doc = validatePlannerFile(file).document
    expect(doc.plan.skillPoints?.maxModifiers).toContainEqual({
      amount: 2,
      sourceParticipantId: 'a',
    })
    doc.plan.actors.push({ ...doc.plan.actors[0]!, id: 'enemy', camp: 'enemy' })
    doc.plan.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: id }]
    expect(() => validatePlannerFile({ ...file, document: doc })).toThrow('structure')
  })

  it('rejects a v9 refund pointing to a different existing ally', () => {
    const { file } = fixtureFor(9)
    const doc = validatePlannerFile(file).document
    doc.plan.actors.push({ ...doc.plan.actors[0]!, id: 'other-ally', position: 1 })
    expect(validatePlannerFile({ ...file, document: doc }).document).toEqual(doc)
    const refund = doc.plan.events
      .flatMap((event) => event.operations)
      .find((operation) => operation.type === 'conditionalRestore')!
    refund.sourceParticipantId = 'other-ally'
    expect(() => validatePlannerFile({ ...file, document: doc })).toThrow('structure')
  })

  it('rejects a future envelope around a valid historical v9 writer output', () => {
    const { file } = fixtureFor(9)
    expect(validatePlannerFile(file).document).toStrictEqual(file.document)
    expect(() => validatePlannerFile({ ...file, version: 10 })).toThrow('version')
  })
})
