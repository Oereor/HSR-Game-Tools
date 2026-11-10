import type { MessageDescriptor, MessageTranslator, ToolLocale } from '../../../locales/types'
import type {
  CharacterEffectOutcome,
  EffectOperation,
  SimulationState,
  SkillPointsState,
  SparkleRefill,
} from '../engine/types'
import { skillPointBalance } from '../engine/skill-points'
import { operationNameDescriptor } from './naming'

export function formatNumber(value: number | bigint, locale: ToolLocale, signed = false): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 6,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(Object.is(value, -0) ? 0 : value)
}

export function formatSkillPointOutcome(
  before: SkillPointsState | undefined,
  amount: number | undefined,
  locale: ToolLocale,
  t: MessageTranslator,
): string {
  if (!before || amount === undefined || !Number.isSafeInteger(amount))
    return t('planner.sp.unavailable')
  return t('planner.sp.outcome', {
    before: formatNumber(before.current, locale),
    after: formatNumber(skillPointBalance(before, amount), locale),
  })
}

export function formatCharacterSkillPointChanges(
  outcome: CharacterEffectOutcome | SparkleRefill,
  locale: ToolLocale,
  t: MessageTranslator,
) {
  const isRefill = 'storedSP' in outcome
  const resource = isRefill
    ? { kind: 'storedSP' as const, ...outcome.storedSP }
    : outcome.charge
      ? { kind: 'charge' as const, ...outcome.charge }
      : outcome.resource
  const { before, after } = outcome.skillPoints
  const spDelta = after - before
  const resourceDelta = resource ? resource.after - resource.before : 0
  const resourceLabel = resource
    ? t(
        resource.kind === 'storedSP'
          ? 'planner.characterEffects.storedSPShort'
          : `planner.characterEffects.resource.${resource.kind}`,
      )
    : undefined
  const formatChange = (label: string, before: number | bigint, after: number | bigint) =>
    t('planner.characterEffects.resourceChange', {
      resource: label,
      before: formatNumber(before, locale),
      after: formatNumber(after, locale),
    })
  const { payment, wastedSkillPoints } = isRefill ? {} : outcome
  return {
    resource:
      resource && resourceLabel && resourceDelta
        ? formatChange(resourceLabel, resource.before, resource.after)
        : undefined,
    delta: spDelta
      ? t('planner.sp.delta', { amount: formatNumber(spDelta, locale, true) })
      : undefined,
    balance: spDelta ? formatChange(t('planner.sp.setup'), before, after) : undefined,
    toneAmount: spDelta || resourceDelta,
    tooltip:
      payment && resourceLabel
        ? t('planner.characterEffects.payment', {
            nominal: formatNumber(payment.nominalCost, locale),
            resource: resourceLabel,
            substitute: formatNumber(payment.substituteUsed, locale),
          })
        : wastedSkillPoints
          ? t('planner.characterEffects.sparkleWaste', {
              amount: formatNumber(wastedSkillPoints, locale),
            })
          : undefined,
  }
}

export function renderMessage(
  message: string | MessageDescriptor,
  locale: ToolLocale,
  t: MessageTranslator,
): string {
  if (typeof message === 'string') return message
  const params = Object.fromEntries(
    Object.entries(message.params ?? {}).map(([key, value]) => [
      key,
      typeof value === 'number'
        ? formatNumber(value, locale)
        : typeof value === 'string'
          ? value
          : 'key' in value
            ? renderMessage(value, locale, t)
            : formatNumber(value.value, locale, value.signed),
    ]),
  )
  return t(message.key, params)
}

export function operationName(
  operation: EffectOperation,
  locale: ToolLocale,
  t: MessageTranslator,
  name: (id: string) => string,
  state?: SimulationState,
  customName?: string,
): string {
  return (
    customName?.trim() || renderMessage(operationNameDescriptor(operation, name, state), locale, t)
  )
}

/** Preserve numeric precision; only this final display step rounds. */
export function formatAV(value: number, locale: ToolLocale, signed = false): string {
  const options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  const parts = new Intl.NumberFormat(locale, options).formatToParts(Math.abs(value))
  const roundsToZero = parts
    .filter((part) => part.type === 'integer' || part.type === 'fraction')
    .every((part) => /^0+$/.test(part.value))
  return new Intl.NumberFormat(locale, {
    ...options,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(roundsToZero ? 0 : value)
}
