import type { ToolLocale } from '../../../locales/types'

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
