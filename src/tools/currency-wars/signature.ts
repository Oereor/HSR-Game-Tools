import type { Lineup } from './types'

/** Slot/display order and solver auxiliaries are not player configuration. */
export function lineupSignature(lineup: Lineup): string {
  return JSON.stringify(
    lineup.members
      .map((member) => [
        member.formId,
        [...member.emblemIds].sort((a, b) => a - b),
        member.navigatorTarget ?? null,
      ])
      .sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0)),
  )
}
