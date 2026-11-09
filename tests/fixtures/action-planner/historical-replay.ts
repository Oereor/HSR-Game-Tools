import { anchorKey } from '../../../src/tools/action-planner/engine/queue'
import type { SimulationResult } from '../../../src/tools/action-planner/engine/types'

/**
 * Shared replay fields for historical-documents.json. Each entry records the archived revision
 * that read and replayed the file. Writer exports use the archived serializer on test inputs.
 * Reader fixtures use synthetic inputs validated by the archived reader for that version.
 * The v1–v3 inputs come from each revision's phase-2a fixture, with an active cycle in v2
 * and a saved Aha contributor in v3. The skill-point inputs are synthetic test plans.
 */
export function projectHistoricalReplay(result: SimulationResult) {
  return {
    timeline: result.records.map((record) => [
      anchorKey(record.anchor),
      record.elapsedAV,
      record.deltaAV,
      record.kind === 'cycleBoundary' ? null : record.effectiveSpeed,
    ]),
    finalQueue: result.snapshots
      .at(-1)
      ?.queue.map((entry) => [anchorKey(entry.anchor), entry.remainingAG, entry.remainingAV]),
    diagnostics: result.diagnostics.filter((issue) => !issue.code.startsWith('sp-')),
    stopReason: result.stopReason,
  }
}
