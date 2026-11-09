import { DEFAULT_SKILL_POINTS } from '../engine/skill-points'
import { countdownParticipantId, spawnedParticipantId } from '../engine/queue'
import type {
  EffectOperation,
  ParticipantDefinition,
  PlanEvent,
  SimulationPlan,
} from '../engine/types'
import type { PlannerMetadata } from './editor'

type Loss = 'dynamicMax' | 'storage' | 'conditionalRestore' | 'policy' | 'inactiveSkill'
export type SkillPointMigration = { losses: Partial<Record<Loss, number>> }

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function skillPointConfigFields(version: number) {
  return [
    'enabled',
    'initial',
    'max',
    ...(version >= 6 && version <= 9 ? ['onInsufficient'] : []),
    ...(version >= 7 && version <= 9 ? ['storedMax'] : []),
    ...(version >= 8 && version <= 9 ? ['maxModifiers'] : []),
  ]
}

export function legacyOperationFields(type: unknown, version: number) {
  if (type === 'restoreSkillPoints' && version >= 5 && version <= 9)
    return { required: ['amount', 'source'], optional: version >= 7 ? ['storeOverflow'] : [] }
  if (type === 'conditionalRestore' && version === 9)
    return {
      required: ['amount', 'chance', 'cooldownTurns', 'outcome', 'sourceParticipantId', 'source'],
      optional: [],
    }
  return undefined
}

/** The source envelope has already checked version gates, string limits and operation identities. */
export function migrateLegacySkillPoints(
  plan: SimulationPlan,
  customNames: PlannerMetadata['customNames'],
  occupied: Set<string>,
  invalid: () => never,
): {
  plan: SimulationPlan
  customNames: PlannerMetadata['customNames']
  notice?: SkillPointMigration
} {
  const losses: SkillPointMigration['losses'] = {}
  const loss = (key: Loss) => {
    losses[key] = (losses[key] ?? 0) + 1
  }
  let skillPoints: SimulationPlan['skillPoints']
  const config: unknown = plan.skillPoints
  if (config !== undefined) {
    if (!record(config)) return invalid()
    const {
      enabled,
      initial = DEFAULT_SKILL_POINTS.initial,
      max = DEFAULT_SKILL_POINTS.max,
      onInsufficient,
      storedMax,
      maxModifiers,
    } = config
    if (
      (enabled !== undefined && typeof enabled !== 'boolean') ||
      !count(initial) ||
      !count(max) ||
      (storedMax !== undefined && !count(storedMax)) ||
      (onInsufficient !== undefined && onInsufficient !== 'stop' && onInsufficient !== 'mark')
    )
      return invalid()
    if (storedMax !== undefined) loss('storage')
    if (onInsufficient !== undefined) loss('policy')
    const modifiers = maxModifiers ?? []
    if (!Array.isArray(modifiers)) return invalid()
    let fixedMax = BigInt(max)
    for (const modifier of modifiers) {
      if (
        !record(modifier) ||
        Object.keys(modifier).some((key) => key !== 'amount' && key !== 'sourceParticipantId') ||
        typeof modifier.amount !== 'number' ||
        !Number.isSafeInteger(modifier.amount) ||
        modifier.amount === 0
      )
        return invalid()
      if (modifier.sourceParticipantId !== undefined) {
        if (
          !plan.actors.some(
            (actor) => actor.id === modifier.sourceParticipantId && actor.camp === 'ally',
          )
        )
          return invalid()
        loss('dynamicMax')
      }
      fixedMax += BigInt(modifier.amount)
    }
    if (fixedMax < BigInt(initial) || fixedMax > BigInt(Number.MAX_SAFE_INTEGER)) return invalid()
    skillPoints = {
      ...(enabled === undefined ? {} : { enabled }),
      ...(config.initial === undefined ? {} : { initial }),
      ...(config.max !== undefined || fixedMax !== BigInt(max) ? { max: Number(fixedMax) } : {}),
    }
  }

  const definitions = new Map<string, ParticipantDefinition>(
    plan.actors.map((actor) => [actor.id, actor]),
  )
  for (const { operations } of plan.events)
    for (const operation of operations)
      if (operation.type === 'spawnParticipant')
        definitions.set(spawnedParticipantId(operation.id), operation.participant)
  const names = { ...customNames }
  let serial = 0
  function change(amount: number, phase: 'preAction' | 'postAction'): EffectOperation {
    let id: string
    do {
      id = `legacy-sp-${++serial}`
    } while (
      occupied.has(id) ||
      occupied.has(spawnedParticipantId(id)) ||
      occupied.has(countdownParticipantId(id))
    )
    occupied.add(id)
    return { id, type: 'changeSkillPoints', amount, phase }
  }

  // Preserve empty anchors until shared validation has checked anchor uniqueness.
  const events = plan.events.map((event): PlanEvent => {
    const { anchor } = event
    const source = anchor.kind === 'action' ? definitions.get(anchor.participantId) : undefined
    const allied = source?.kind === 'actor' && source.camp === 'ally'
    const automatic = allied && source.category !== 'summon' && source.category !== 'memosprite'
    const { skill } = event as PlanEvent & { skill?: unknown }
    let cost = 0
    let recovery = 0
    if (skill !== undefined) {
      if (anchor.kind !== 'action' || !record(skill)) return invalid()
      if (skill.kind === 'custom') {
        if (
          Object.keys(skill).some((key) => !['kind', 'cost', 'recovery'].includes(key)) ||
          !count(skill.cost) ||
          !count(skill.recovery)
        )
          return invalid()
        cost = skill.cost
        recovery = skill.recovery
      } else {
        if (Object.keys(skill).length !== 1 || (skill.kind !== 'basic' && skill.kind !== 'skill'))
          return invalid()
        cost = skill.kind === 'skill' ? 1 : 0
        recovery = skill.kind === 'basic' ? 1 : 0
      }
      if (!automatic) loss('inactiveSkill')
    }
    let conditionalSeen = false
    const operations = event.operations.flatMap((operation): EffectOperation[] => {
      const raw = operation as unknown as Record<string, unknown>
      if (raw.type !== 'restoreSkillPoints' && raw.type !== 'conditionalRestore') return [operation]
      const { id, phase } = operation
      if (
        !count(raw.amount) ||
        raw.amount === 0 ||
        typeof raw.source !== 'string' ||
        !raw.source.trim() ||
        (anchor.kind === 'action'
          ? !allied || (phase !== 'preAction' && phase !== 'postAction')
          : anchor.kind !== 'start' || phase !== undefined)
      )
        return invalid()
      if (raw.type === 'conditionalRestore') {
        if (
          conditionalSeen ||
          anchor.kind !== 'action' ||
          phase !== 'postAction' ||
          (automatic && (!record(skill) || skill.kind !== 'skill')) ||
          raw.sourceParticipantId !== anchor.participantId ||
          typeof raw.chance !== 'number' ||
          raw.chance < 0 ||
          raw.chance > 1 ||
          !count(raw.cooldownTurns) ||
          (raw.outcome !== 'proc' && raw.outcome !== 'no-proc')
        )
          return invalid()
        conditionalSeen = true
        loss('conditionalRestore')
        delete names[id]
        return []
      }
      if (raw.storeOverflow !== undefined && typeof raw.storeOverflow !== 'boolean')
        return invalid()
      if (raw.storeOverflow) loss('storage')
      if (!Object.hasOwn(names, id)) names[id] = raw.source
      return [{ id, phase, type: 'changeSkillPoints', amount: raw.amount }]
    })
    if (automatic && cost) operations.push(change(-cost, 'preAction'))
    if (automatic && recovery) operations.unshift(change(recovery, 'postAction'))
    return { anchor, operations }
  })
  return {
    plan: { ...plan, skillPoints, events },
    customNames: names,
    ...(skillPoints?.enabled || Object.keys(losses).length ? { notice: { losses } } : {}),
  }
}
