import { skillPointBalance } from './skill-points'
import type {
  ActorConfig,
  CharacterEffectId,
  CharacterEffectOperation,
  CharacterEffectOutcome,
  CharacterEffectState,
  CharacterEffectWarning,
  EventAnchor,
  SimulationState,
} from './types'

export const ARCHER_CHARACTER_ID = '1015'
export const BRONYA_CHARACTER_ID = '1101'
export const ARCHER_CHARGE_CAP = 4
export const CHARACTER_EFFECT_IDS = [
  'archer.ultimateCharge',
  'archer.followUp',
  'bronya.e1.refund',
] as const satisfies readonly CharacterEffectId[]

export const effectCharacterId = (id: CharacterEffectId) =>
  id === 'bronya.e1.refund' ? BRONYA_CHARACTER_ID : ARCHER_CHARACTER_ID

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
    if (id === BRONYA_CHARACTER_ID) effects.set(actor.id, { kind: 'bronya', availableFromTurn: {} })
  }
  return effects
}

export function cloneCharacterEffects(effects: ReadonlyMap<string, CharacterEffectState>) {
  return new Map(
    Array.from(
      effects,
      ([id, effect]) =>
        [
          id,
          effect.kind === 'bronya'
            ? { ...effect, availableFromTurn: { ...effect.availableFromTurn } }
            : { ...effect },
        ] as const,
    ),
  )
}

function resolveCharacterEffectSource(
  state: SimulationState,
  { effectId, sourceParticipantId }: CharacterEffectOperation,
  anchor: EventAnchor,
): CharacterEffectState | 'character-effect-source' | 'character-effect-anchor' {
  const effect = state.characterEffects?.get(sourceParticipantId)
  if (
    effect?.kind !== (effectId === 'bronya.e1.refund' ? 'bronya' : 'archer') ||
    !state.participants.some(
      (p) => p.id === sourceParticipantId && p.kind === 'actor' && !p.departed,
    )
  )
    return 'character-effect-source'
  if (
    effectId === 'bronya.e1.refund' &&
    (anchor.kind !== 'action' || anchor.participantId !== sourceParticipantId)
  )
    return 'character-effect-anchor'
  return effect
}

export function characterEffectSourceIssue(
  state: SimulationState,
  operation: CharacterEffectOperation,
  anchor: EventAnchor,
): CharacterEffectWarning | undefined {
  const source = resolveCharacterEffectSource(state, operation, anchor)
  return typeof source === 'string' ? source : undefined
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
  if (effect.kind === 'archer') {
    if (effectId === 'archer.followUp' && effect.charge === 0) return 'archer-no-charge'
    const before = effect.charge
    effect.charge =
      effectId === 'archer.ultimateCharge' ? Math.min(before + 2, ARCHER_CHARGE_CAP) : before - 1
    outcome.charge = { before, after: effect.charge }
    if (effectId === 'archer.ultimateCharge') return outcome
  } else {
    if (anchor.kind !== 'action') return 'character-effect-anchor'
    if (anchor.turn < (effect.availableFromTurn[effectId] ?? 0)) return 'bronya-e1-cooldown'
    outcome.availableFromTurn = anchor.turn + 2
    effect.availableFromTurn[effectId] = outcome.availableFromTurn
  }
  sp.current = skillPointBalance(sp, 1)
  outcome.skillPoints.after = sp.current
  return outcome
}
