import type { EffectOperation, EventAnchor, EffectPhase, SimulationState } from '../engine/types'
import type { PlannerDocument } from '../model/editor'

export type Value =
  | number
  | string
  | null
  | Input
  | {
      type: 'self-stat'
      stat: 'panelSpeed'
    }
  | {
      type: 'ref'
      id: string
    }
  | {
      type: 'character-stat'
      characterId: string
      stat: 'baseSpeed'
    }
  | {
      type: 'i18n'
      key: string
      params?: Record<string, Value>
    }
  | {
      type: 'multiply' | 'divide'
      left: Value
      right: Value
    }
export interface Input {
  type: 'user-input'
  id: string
  value: number | string | { type: 'character-stat'; characterId: string; stat: 'baseSpeed' }
  i18n?: { label?: string; hint?: string; placeholder?: string; suffix?: string }
  minimum?: number
  exclusiveMinimum?: number
}
export type PresetTarget = 'self' | 'allies' | 'enemies' | 'selected' | { snapshot: string }
interface TargetOptions {
  target: PresetTarget
  onEmpty?: 'skip'
}
type PresetTargetedOperation = TargetOptions &
  (
    | { type: 'advance' | 'delay'; percent: Value }
    | { type: 'immediatelyAct' | 'depart' | 'returnToField' }
    | {
        type: 'addSpeedModifier'
        mode: 'flat' | 'percent'
        amount: Value
        duration: { kind: 'turns'; turns: Value } | { kind: 'countdown'; name: Value; speed: Value }
      }
  )
interface PresetSpawnOperation {
  type: 'spawnParticipant'
  participant: {
    name: Value
    iconUrl?: Value
    initialAG?: Value
  } & (
    | { kind: 'scheduledEvent'; baseSpeed?: Value; speed: Value }
    | {
        kind: 'actor'
        camp: 'ally' | 'enemy'
        category?: 'character' | 'enemy' | 'summon' | 'memosprite' | 'custom'
        baseSpeed: Value
        panelSpeed: Value
        actionLimit?: Value
      }
  )
}
type PresetSkillPointOperation<T extends 'restoreSkillPoints' | 'conditionalRestore'> = Omit<
  Extract<EffectOperation, { type: T }>,
  'id' | 'phase'
>
export type PresetOperation =
  | (PresetTargetedOperation & { onTrigger?: PresetOperation[] })
  | (PresetSpawnOperation & { target?: never; onEmpty?: never; onTrigger?: PresetOperation[] })
  | ((
      | PresetSkillPointOperation<'restoreSkillPoints'>
      | PresetSkillPointOperation<'conditionalRestore'>
    ) & {
      target?: never
      onEmpty?: never
      onTrigger?: never
    })
export interface PresetDefinition {
  $schema?: string
  id: string
  order: number
  characterId?: string
  selfPresence?: 'present' | 'departed' | 'any'
  i18n: { name: string; description: string; unavailable?: Record<string, string> }
  icon?: { characterId: string } | { assetKey: string }
  interaction: 'draft' | 'batch'
  startOnly?: boolean
  snapshots?: Record<string, { target: 'allies' | 'enemies'; operation: 'depart' }>
  previews?: { key: string; params: Record<string, Value> }[]
  operations: PresetOperation[]
}
export type Translate = (key: string, params?: Record<string, string | number>) => string
export interface PresetRequest {
  id: string
  values: Record<string, unknown>
  translate: Translate
}
export interface PresetContext {
  document: PlannerDocument
  anchor: EventAnchor
  phase: EffectPhase
  preview?: SimulationState
  selectedIds?: string[]
  values?: Record<string, unknown>
  translate: Translate
}
export interface PresetResult {
  document?: PlannerDocument
  operationIds: string[]
  invalid: string[]
  issue?: { code: string; field?: string; operationIndex?: number; target?: PresetTarget }
}
export const PRESET_LIMITS = { depth: 4, operations: 128, inputs: 64, valueDepth: 16 } as const
