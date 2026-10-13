import { anchorKey, orderedParticipants } from '../../../engine/action-planner/queue'
import { operationTargets, targetIds } from '../../../engine/action-planner/targeting'
import type {
  ActionChangeTrace,
  EffectOperation,
  EventAnchor,
  ParticipantInfo,
  SimulationState,
  Target,
} from '../../../engine/action-planner/types'
import type { ToolLocale } from '../../../locales/types'

export function participantLabels(
  participants: readonly ParticipantInfo[],
  name: (id: string) => string,
): Map<string, string> {
  const groups = new Map<string, ParticipantInfo[]>()
  for (const p of participants) {
    const label = name(p.id)
    const group = groups.get(label) ?? []
    group.push(p)
    groups.set(label, group)
  }
  const labels = new Map<string, string>()
  for (const [label, group] of groups)
    group
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .forEach((p, i) => labels.set(p.id, group.length > 1 ? `${label} #${i + 1}` : label))
  return labels
}
export function namingTargets(
  operation: Exclude<EffectOperation, { type: 'spawnParticipant' }>,
  state?: SimulationState,
): string[] | undefined {
  if (!state) return undefined
  const participants = operationTargets(state)
  const ids = targetIds(operation.target, participants)
  if (ids.some((id) => !participants.some((p) => p.id === id))) return undefined
  if (operation.type === 'addSpeedModifier') return ids
  const queued = new Set(orderedParticipants(state).map((p) => p.id))
  return ids.filter((id) => queued.has(id))
}
export function targetLabel(
  target: Target,
  locale: ToolLocale,
  name: (id: string) => string,
  ids?: readonly string[],
): string {
  const zh = locale === 'zh-CN'
  if (ids?.length === 1) return name(ids[0]!)
  if (ids && ids.length > 1) return zh ? `${ids.length} 个目标` : `${ids.length} targets`
  if (target.kind === 'participants' && target.participantIds.length === 1)
    return name(target.participantIds[0]!)
  return target.kind === 'allies'
    ? zh
      ? '我方全体'
      : 'all allies'
    : target.kind === 'enemies'
      ? zh
        ? '敌方全体'
        : 'all enemies'
      : zh
        ? '指定目标'
        : 'selected targets'
}
export function operationName(
  operation: EffectOperation,
  locale: ToolLocale,
  name: (id: string) => string,
  state?: SimulationState,
  customName?: string,
): string {
  if (customName?.trim()) return customName.trim()
  const zh = locale === 'zh-CN'
  const number = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(v)
  if (operation.type === 'spawnParticipant') {
    const p = operation.participant
    const kind =
      p.kind === 'scheduledEvent'
        ? zh
          ? '事件'
          : 'Event'
        : p.camp === 'enemy'
          ? zh
            ? '敌方单位'
            : 'Enemy'
          : p.category === 'summon'
            ? zh
              ? '召唤物'
              : 'Summon'
            : p.category === 'memosprite'
              ? zh
                ? '忆灵'
                : 'Memosprite'
              : zh
                ? '行动单位'
                : 'Actor'
    return zh ? `创建${kind}：${p.name}` : `Create ${kind}: ${p.name}`
  }
  const label = targetLabel(operation.target, locale, name, namingTargets(operation, state))
  if (operation.type === 'advance')
    return zh
      ? `使 ${label} 行动提前 ${number(operation.percent)}%`
      : `Advance ${label} by ${number(operation.percent)}%`
  if (operation.type === 'delay')
    return zh
      ? `使 ${label} 行动延后 ${number(operation.percent)}%`
      : `Delay ${label} by ${number(operation.percent)}%`
  if (operation.type === 'immediatelyAct')
    return zh ? `使 ${label} 立即行动` : `Make ${label} act immediately`
  const amount = number(Math.abs(operation.amount)),
    positive = operation.amount >= 0,
    percent = operation.mode === 'percent'
  return zh
    ? `使 ${label} ${percent ? '基础' : '固定'}速度${positive ? '提高' : '降低'} ${amount}${percent ? '%' : ''}`
    : `${positive ? 'Increase' : 'Decrease'} ${percent ? 'base' : 'flat'} speed of ${label} by ${amount}${percent ? '%' : ''}`
}
export function actionDirections(
  anchor: EventAnchor,
  changes: readonly ActionChangeTrace[],
): { advance: boolean; delay: boolean } {
  const relevant = changes.filter(
    (c) =>
      anchorKey(c.targetAnchor) === anchorKey(anchor) &&
      (c.beforeAG !== c.afterAG || c.zeroAVInsertion),
  )
  return {
    advance: relevant.some((c) => c.type === 'advance'),
    delay: relevant.some((c) => c.type === 'delay'),
  }
}
