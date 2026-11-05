// Input/translation fixtures for the pre-refactor behavioral regressions.
// All operation sequences come exclusively from the production JSON definitions.
import { presets } from '../../../src/tools/action-planner/presets/catalog'
import { compilePreset } from '../../../src/tools/action-planner/presets/resolver'
import { gameData } from '../../../src/tools/action-planner/data/adapters/game-data'
import type { PresetContext, PresetRequest } from '../../../src/tools/action-planner/presets/types'
import type { PlannerDocument } from '../../../src/tools/action-planner/model/editor'
import type { SimulationState } from '../../../src/tools/action-planner/engine/types'

export interface KhaslanaPresetInput {
  baseSpeed: number | undefined
  inheritancePercent: number | undefined
  names: string[]
}
type FireflyInput = { spd: number | undefined; countdownName: string }
type RobinInput = { name: string }
export const fireflyRequest = (input: FireflyInput): PresetRequest => ({
  id: 'firefly-ultimate',
  values: { spd: input.spd },
  translate: () => input.countdownName,
})
export const robinRequest = (input: RobinInput): PresetRequest => ({
  id: 'robin-ultimate',
  values: {},
  translate: () => input.name,
})
export const khaslanaRequest = (input: KhaslanaPresetInput): PresetRequest => ({
  id: 'khaslana',
  values: { baseSpeed: input.baseSpeed, inheritancePercent: input.inheritancePercent },
  translate: (key, params) =>
    key.endsWith('finalName') ? input.names[7]! : input.names[Number(params?.index) - 1]!,
})
function compile(
  request: PresetRequest,
  args: [
    PlannerDocument,
    PresetContext['anchor'],
    PresetContext['phase'],
    SimulationState | undefined,
  ],
  nextId: () => string,
) {
  const [document, anchor, phase, preview] = args
  const result = compilePreset(
    presets.find((p) => p.id === request.id)!,
    { document, anchor, phase, preview, ...request },
    gameData.characters,
    nextId,
  )
  return result
}
type Args = [
  PlannerDocument,
  PresetContext['anchor'],
  PresetContext['phase'],
  SimulationState | undefined,
]
export function compileFireflyFixture(...args: [...Args, FireflyInput, () => string]) {
  return compile(fireflyRequest(args[4]), [args[0], args[1], args[2], args[3]], args[5])
}
export function compileRobinFixture(...args: [...Args, RobinInput, () => string]) {
  return compile(robinRequest(args[4]), [args[0], args[1], args[2], args[3]], args[5])
}
export function compileKhaslanaFixture(...args: [...Args, KhaslanaPresetInput, () => string]) {
  return compile(khaslanaRequest(args[4]), [args[0], args[1], args[2], args[3]], args[5])
}
export function availability(id: string, document: PlannerDocument, preview?: SimulationState) {
  let serial = 0
  const result = compilePreset(
    presets.find((p) => p.id === id)!,
    { document, preview, anchor: { kind: 'start' }, phase: 'postAction', translate: (key) => key },
    gameData.characters,
    () => `test-${++serial}`,
  )
  return { issue: result.invalid[0] }
}
export const fireflyAvailability = (document: PlannerDocument, preview?: SimulationState) =>
  availability('firefly-ultimate', document, preview)
export const robinAvailability = (document: PlannerDocument, preview?: SimulationState) =>
  availability('robin-ultimate', document, preview)
