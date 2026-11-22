import { emptyMap, type ReadyMap } from './engine/map'

const at = (x: number, y: number) => ({ x, y })

export const demos = {
  platform: {
    ...emptyMap(),
    start: at(0, 0),
    goal: at(3, 0),
    floors: [at(0, 0), at(1, 0), at(3, 0)],
    platformGroups: [
      {
        id: 'bridge',
        controllers: [at(1, 0)],
        platforms: [{ id: 'bridge-span', cells: [at(2, 0)], enabledWhenPressed: true }],
      },
    ],
  },
  portal: {
    ...emptyMap(),
    k: 2,
    start: at(0, 2),
    goal: at(5, 1),
    floors: [at(0, 2), at(0, 0), at(1, 0), at(4, 1), at(5, 1)],
    ladders: [{ top: at(0, 0), bottom: at(0, 2) }],
    portalPairs: [
      { id: 'gate', initiallyOpen: false, ends: [at(1, 0), at(4, 1)], controllers: [at(0, 0)] },
    ],
  },
} satisfies Record<string, ReadyMap>
