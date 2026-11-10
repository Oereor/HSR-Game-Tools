import { skillPointBalance } from './skill-points'
import type {
  ActorConfig,
  CharacterEffectId,
  CharacterEffectOperation,
  CharacterEffectOutcome,
  CharacterEffectState,
  CharacterEffectWarning,
  EventAnchor,
  EnhancedBasicCost,
  SkillPointsState,
  SimulationState,
  SparkleRefill,
} from './types'

export const ARCHER_CHARACTER_ID = '1015'
export const IMBIBITOR_LUNAE_CHARACTER_ID = '1213'
export const SPARKLE_CHARACTER_ID = '1306'
export const ARCHER_CHARGE_CAP = 4
export const SQUAMA_CAP = 3
export const SPARKLE_STORAGE_CAP = 10
const SPARKLE_ULTIMATE_RECOVERY = 6
export const ENHANCED_BASIC_COSTS = [1, 2, 3] as const
const characterKinds = {
  'archer.ultimateCharge': 'archer',
  'archer.followUp': 'archer',
  'imbibitorLunae.ultimate': 'imbibitorLunae',
  'imbibitorLunae.ultimateE2': 'imbibitorLunae',
  'imbibitorLunae.enhancedBasic': 'imbibitorLunae',
  'sparkle.ultimate': 'sparkle',
} as const satisfies Record<CharacterEffectId, CharacterEffectState['kind']>
export const CHARACTER_EFFECT_IDS = Object.keys(characterKinds) as CharacterEffectId[]
const characterIdsByKind = {
  archer: ARCHER_CHARACTER_ID,
  imbibitorLunae: IMBIBITOR_LUNAE_CHARACTER_ID,
  sparkle: SPARKLE_CHARACTER_ID,
}

export const effectCharacterId = (id: CharacterEffectId) => characterIdsByKind[characterKinds[id]]

export const characterEffectRequiresOwnAction = (id: CharacterEffectId) =>
  id === 'imbibitorLunae.enhancedBasic'

export function validEnhancedBasicCost(cost: unknown): cost is EnhancedBasicCost {
  return ENHANCED_BASIC_COSTS.some((value) => value === cost)
}

export function validInitialArcherCharge(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= ARCHER_CHARGE_CAP
  )
}

export function initialCharacterEffects(
  actors: readonly ActorConfig[],
  characterIds: Readonly<Record<string, string>>,
): Map<string, CharacterEffectState> {
  const effects = new Map<string, CharacterEffectState>()
  for (const actor of actors) {
    if (actor.camp !== 'ally' || !Object.hasOwn(characterIds, actor.id)) continue
    const id = characterIds[actor.id]
    if (id === ARCHER_CHARACTER_ID)
      effects.set(actor.id, { kind: 'archer', charge: actor.initialArcherCharge ?? 0 })
    if (id === IMBIBITOR_LUNAE_CHARACTER_ID)
      effects.set(actor.id, {
        kind: 'imbibitorLunae',
        squama: actor.imbibitorLunaeTechnique ? 1 : 0,
      })
    if (id === SPARKLE_CHARACTER_ID) effects.set(actor.id, { kind: 'sparkle', storedSP: 0 })
  }
  return effects
}

export function cloneCharacterEffects(effects: ReadonlyMap<string, CharacterEffectState>) {
  return new Map(Array.from(effects, ([id, effect]) => [id, { ...effect }] as const))
}

function resolveCharacterEffectSource(
  state: SimulationState,
  {
    effectId,
    sourceParticipantId,
  }: Pick<CharacterEffectOperation, 'effectId' | 'sourceParticipantId'>,
  anchor: EventAnchor,
): CharacterEffectState | 'character-effect-source' | 'character-effect-anchor' {
  const effect = state.characterEffects?.get(sourceParticipantId)
  if (
    !effect ||
    effect.kind !== characterKinds[effectId] ||
    !state.participants.some(
      (p) => p.id === sourceParticipantId && p.kind === 'actor' && !p.departed,
    )
  )
    return 'character-effect-source'
  if (
    characterEffectRequiresOwnAction(effectId) &&
    (anchor.kind !== 'action' || anchor.participantId !== sourceParticipantId)
  )
    return 'character-effect-anchor'
  return effect
}

export function characterEffectSourceIssue(
  state: SimulationState,
  operation: Pick<CharacterEffectOperation, 'effectId' | 'sourceParticipantId'>,
  anchor: EventAnchor,
): CharacterEffectWarning | undefined {
  const source = resolveCharacterEffectSource(state, operation, anchor)
  return typeof source === 'string' ? source : undefined
}

function payWithSubstitute(
  outcome: CharacterEffectOutcome,
  sp: SkillPointsState,
  nominalCost: number,
  available: number,
): number {
  const substituteUsed = Math.min(nominalCost, available)
  const actualSpCost = nominalCost - substituteUsed
  sp.current = skillPointBalance(sp, -actualSpCost)
  outcome.skillPoints.after = sp.current
  outcome.payment = { nominalCost, substituteUsed, actualSpCost }
  return available - substituteUsed
}

/** Settles only on the execution copy. A failed check leaves both resources untouched. */
export function settleCharacterEffect(
  state: SimulationState,
  operation: CharacterEffectOperation & { id: string },
  anchor: EventAnchor,
): CharacterEffectOutcome | CharacterEffectWarning | undefined {
  const sp = state.skillPoints
  if (!sp) return
  const { id, effectId, sourceParticipantId } = operation
  const effect = resolveCharacterEffectSource(state, operation, anchor)
  if (typeof effect === 'string') return effect
  const outcome: CharacterEffectOutcome = {
    operationId: id,
    sourceParticipantId,
    effectId,
    skillPoints: { before: sp.current, after: sp.current },
  }
  if (effect.kind === 'sparkle') {
    const before = effect.storedSP
    sp.current = skillPointBalance(sp, SPARKLE_ULTIMATE_RECOVERY)
    const restored = Number(sp.current - outcome.skillPoints.before)
    const overflow = SPARKLE_ULTIMATE_RECOVERY - restored
    effect.storedSP = Math.min(SPARKLE_STORAGE_CAP, before + overflow)
    outcome.skillPoints.after = sp.current
    outcome.resource = { kind: 'storedSP', before, after: effect.storedSP }
    outcome.wastedSkillPoints = overflow - (effect.storedSP - before)
    return outcome
  }
  if (effect.kind === 'imbibitorLunae') {
    const before = effect.squama
    effect.squama =
      operation.effectId === 'imbibitorLunae.enhancedBasic'
        ? payWithSubstitute(outcome, sp, operation.cost, before)
        : Math.min(SQUAMA_CAP, before + (effectId === 'imbibitorLunae.ultimateE2' ? 3 : 2))
    outcome.resource = { kind: 'squama', before, after: effect.squama }
    return outcome
  }
  if (effectId === 'archer.followUp' && effect.charge === 0) return 'archer-no-charge'
  const before = effect.charge
  effect.charge =
    effectId === 'archer.ultimateCharge' ? Math.min(before + 2, ARCHER_CHARGE_CAP) : before - 1
  outcome.charge = { before, after: effect.charge }
  if (effectId === 'archer.ultimateCharge') return outcome
  sp.current = skillPointBalance(sp, 1)
  outcome.skillPoints.after = sp.current
  return outcome
}

/** Drains stores in initial roster order. Departure preserves the store until removal. */
export function refillSparkleSkillPoints(state: SimulationState): SparkleRefill[] {
  const refills: SparkleRefill[] = []
  const sp = state.skillPoints
  if (!sp || !state.characterEffects) return refills
  const cap = BigInt(sp.max)
  for (const [sourceParticipantId, effect] of state.characterEffects) {
    if (sp.current >= cap) break
    if (
      effect.kind !== 'sparkle' ||
      !effect.storedSP ||
      !state.participants.some((participant) => participant.id === sourceParticipantId)
    )
      continue
    const beforeSP = sp.current
    const beforeStored = effect.storedSP
    sp.current = skillPointBalance(sp, beforeStored)
    effect.storedSP -= Number(sp.current - beforeSP)
    refills.push({
      sourceParticipantId,
      skillPoints: { before: beforeSP, after: sp.current },
      storedSP: { before: beforeStored, after: effect.storedSP },
    })
  }
  return refills
}
