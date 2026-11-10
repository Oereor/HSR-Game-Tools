export type Camp = 'ally' | 'enemy'

interface ParticipantDefinitionBase {
  name: string
  iconUrl?: string
  initialAG?: number
}
export interface ActorDefinition extends ParticipantDefinitionBase {
  kind: 'actor'
  category?: 'character' | 'enemy' | 'summon' | 'memosprite' | 'custom'
  camp: Camp
  baseSpeed: number
  panelSpeed: number
  actionLimit?: number | null
}
export interface ScheduledEventDefinition extends ParticipantDefinitionBase {
  kind: 'scheduledEvent'
  baseSpeed?: number
  speed: number
}
export type ParticipantDefinition = ActorDefinition | ScheduledEventDefinition
export interface ActorConfig extends ActorDefinition {
  id: string
  position: number
  initialArcherCharge?: number
  imbibitorLunaeTechnique?: boolean
}
export type ParticipantAnchor =
  | { kind: 'action'; participantId: string; turn: number }
  | { kind: 'trigger'; participantId: string }
export type CycleMode = 'none' | 'moc' | 'aa'
export type CycleAnchor = { kind: 'cycleBoundary'; ordinal: number }
export type NodeAnchor = ParticipantAnchor | CycleAnchor
export type EventAnchor = { kind: 'start' } | NodeAnchor
export type Target =
  { kind: 'participants'; participantIds: string[] } | { kind: 'allies' } | { kind: 'enemies' }
export type EffectPhase = 'preAction' | 'postAction'
/** Runtime explanation for one committed gauge operation; never part of a plan. */
export interface ActionChangeTrace {
  operationId: string
  sourceAnchor: EventAnchor
  phase?: EffectPhase
  targetAnchor: ParticipantAnchor
  elapsedAV: number
  type: 'advance' | 'delay' | 'immediatelyAct'
  beforeAG: number
  afterAG: number
  effectiveSpeed: number
  deltaAV: number
  zeroAVInsertion: boolean
}
export type SpeedDuration =
  { kind: 'turns'; turns: number | null } | { kind: 'countdown'; name: string; speed: number }
export type EnhancedBasicCost = 1 | 2 | 3
export type CharacterEffectParameters =
  | { effectId: 'imbibitorLunae.enhancedBasic'; cost: EnhancedBasicCost }
  | {
      effectId:
        | 'archer.ultimateCharge'
        | 'archer.followUp'
        | 'imbibitorLunae.ultimate'
        | 'imbibitorLunae.ultimateE2'
        | 'sparkle.ultimate'
      cost?: never
    }
export type CharacterEffectId = CharacterEffectParameters['effectId']
export type CharacterEffectOperation = CharacterEffectParameters & {
  type: 'characterEffect'
  sourceParticipantId: string
}
export type EffectOperation = { id: string; phase?: EffectPhase } & (
  | { type: 'advance'; target: Target; percent: number }
  | { type: 'delay'; target: Target; percent: number }
  | { type: 'immediatelyAct'; target: Target }
  | { type: 'depart'; target: Target }
  | { type: 'returnToField'; target: Target }
  | {
      type: 'addSpeedModifier'
      target: Target
      mode: 'flat' | 'percent'
      amount: number
      duration: SpeedDuration
    }
  | { type: 'changeSkillPoints'; amount: number }
  | CharacterEffectOperation
  | { type: 'spawnParticipant'; participant: ParticipantDefinition }
)
export type TargetedOperation = Exclude<
  EffectOperation,
  { type: 'spawnParticipant' | 'changeSkillPoints' | 'characterEffect' }
>
export type SkillPointOperation = Extract<
  EffectOperation,
  { type: 'changeSkillPoints' | 'characterEffect' }
>
export interface PlanEvent {
  anchor: EventAnchor
  operations: EffectOperation[]
}
export interface SkillPointsConfig {
  enabled?: boolean
  initial?: number
  max?: number
}
export interface SkillPointsState {
  current: bigint
  max: number
}
export type CharacterEffectState =
  | { kind: 'archer'; charge: number }
  | { kind: 'imbibitorLunae'; squama: number }
  | { kind: 'sparkle'; storedSP: number }
export interface CharacterEffectOutcome {
  operationId: string
  sourceParticipantId: string
  effectId: CharacterEffectId
  skillPoints: { before: bigint; after: bigint }
  charge?: { before: number; after: number }
  resource?: { kind: 'squama' | 'storedSP'; before: number; after: number }
  payment?: { nominalCost: number; substituteUsed: number; actualSpCost: number }
  wastedSkillPoints?: number
}
/** Derived from a completed character turn and never stored as an operation. */
export interface SparkleRefill {
  sourceParticipantId: string
  skillPoints: { before: bigint; after: bigint }
  storedSP: { before: number; after: number }
}
export interface AhaConfig {
  id: string
  baseSpeed: number
  contributorIds: string[]
}
export interface SimulationPlan {
  skillPoints?: SkillPointsConfig
  aha: AhaConfig
  cycleMode: CycleMode
  actors: ActorConfig[]
  events: PlanEvent[]
  maxNodes: number
  maxAV: number
}
export interface SpeedModifierInstance {
  id: string
  operationId: string
  mode: 'flat' | 'percent'
  amount: number
  lifetime:
    { kind: 'turns'; remainingTurns: number | null } | { kind: 'countdown'; participantId: string }
}
interface QueueState {
  id: string
  departed: boolean
  remainingAG: number
  order: number
  zeroBatch: number
  zeroOrder: number
  pendingActionChanges: ActionChangeTrace[]
}
export interface ActorState extends ActorDefinition, QueueState {
  turns: number
  modifiers: SpeedModifierInstance[]
}
export interface ScheduledEventState extends ScheduledEventDefinition, QueueState {
  modifiers: SpeedModifierInstance[]
}
export interface AhaState extends QueueState {
  kind: 'aha'
  name: string
  iconUrl?: string
  camp: 'neutral'
  baseSpeed: number
  contributorIds: string[]
  turns: number
  modifiers: SpeedModifierInstance[]
}
export type NaturalParticipantState = ActorState | AhaState
export type ParticipantState = NaturalParticipantState | ScheduledEventState
export function isNaturalParticipant(p: ParticipantState): p is NaturalParticipantState {
  return p.kind === 'actor' || p.kind === 'aha'
}
export interface ParticipantInfo {
  id: string
  kind: ParticipantState['kind']
  name: string
  iconUrl?: string
  camp?: Camp | 'neutral'
}
export interface SimulationState {
  skillPoints?: SkillPointsState
  characterEffects?: Map<string, CharacterEffectState>
  cycle?: { mode: Exclude<CycleMode, 'none'>; nextOrdinal: number; maxAV: number }
  participants: ParticipantState[]
  elapsedAV: number
  completedNodes: number
  completedActions: number
  batch: number
  nextOrder: number
  issuedParticipantIds: Set<string>
  activeParticipantId?: string
}
export type SkillPointWarning = 'sp-negative-first' | 'sp-negative'
export type CharacterEffectWarning =
  'character-effect-source' | 'character-effect-anchor' | 'archer-no-charge'
export type DiagnosticCode =
  | SkillPointWarning
  | CharacterEffectWarning
  | 'invalid-input'
  | 'invalid-target'
  | 'duplicate-participant'
  | 'invalid-speed'
  | 'non-finite'
  | 'missing-target'
  | 'active-target'
  | 'unreached-anchor'
  | 'no-participants'
export interface Diagnostic {
  code: DiagnosticCode
  severity: 'error' | 'warning' | 'info'
  anchor?: EventAnchor
  operationId?: string
  participantId?: string
}
export interface QueueEntry extends ParticipantInfo {
  anchor: ParticipantAnchor
  remainingAG: number
  remainingAV: number
  effectiveSpeed: number
  modifiers: SpeedModifierInstance[]
  actionChanges: ActionChangeTrace[]
}
export interface QueueSnapshot {
  skillPoints?: SkillPointsState
  characterEffects?: Map<string, CharacterEffectState>
  nextCycleBoundary?: PendingCycleBoundary
  elapsedAV: number
  completedNodes: number
  completedActions: number
  queue: QueueEntry[]
}
export interface PendingCycleBoundary {
  kind: 'cycleBoundary'
  anchor: CycleAnchor
  elapsedAV: number
  remainingAV: number
}
interface RecordBase {
  elapsedAV: number
  deltaAV: number
  beforeEffects: SimulationState
  actionChanges: ActionChangeTrace[]
}
export interface ParticipantNodeRecord extends ParticipantInfo, RecordBase {
  anchor: ParticipantAnchor
  effectiveSpeed: number
  sparkleRefills?: readonly SparkleRefill[]
}
export interface CycleNodeRecord extends RecordBase {
  kind: 'cycleBoundary'
  anchor: CycleAnchor
}
export type NodeRecord = ParticipantNodeRecord | CycleNodeRecord
export interface SimulationResult {
  records: NodeRecord[]
  snapshots: QueueSnapshot[]
  startState?: SimulationState
  participants: ParticipantInfo[]
  diagnostics: Diagnostic[]
  characterEffectOutcomes: CharacterEffectOutcome[]
  stopReason: 'nodes' | 'av' | 'error' | 'empty'
}
