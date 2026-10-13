import { gameData } from '../../../data/adapters/game-data'
import type { NodeAnchor, SimulationPlan } from '../../../engine/action-planner/types'
import type { PrototypeOperation } from './state'
export const sampleCharacters = ['1001', '1101', '1208', '1306'].map((id) =>
  gameData.characters.find((c) => c.id === id)!,
)
export const sampleSpeeds = [160, 134, 120, 110]
export const anchorKey = (anchor: NodeAnchor) =>
  anchor.kind === 'action'
    ? `action:${anchor.participantId}:${anchor.turn}`
    : `trigger:${anchor.participantId}`
export const samplePlan: SimulationPlan = {
  actors: sampleCharacters.map((c, position) => ({
    id: c.id,
    name: c.id,
    kind: 'actor',
    camp: 'ally',
    category: 'character',
    position,
    baseSpeed: c.baseSpeed!,
    panelSpeed: sampleSpeeds[position]!,
  })),
  events: [
    {
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'sample:advance',
          type: 'advance',
          target: { kind: 'participants', participantIds: ['1001'] },
          percent: 20,
        },
        {
          id: 'sample:delay',
          type: 'delay',
          target: { kind: 'participants', participantIds: ['1208'] },
          percent: 15,
        },
        {
          id: 'sample:event',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'sampleEvent', speed: 90 },
        },
      ],
    },
    {
      anchor: { kind: 'action', participantId: '1001', turn: 1 },
      operations: [
        {
          id: 'sample:speed',
          type: 'addSpeedModifier',
          phase: 'postAction',
          target: { kind: 'participants', participantIds: ['1101'] },
          mode: 'flat',
          amount: 20,
          duration: { kind: 'turns', turns: 2 },
        },
      ],
    },
  ],
  maxNodes: 14,
  maxAV: 300,
}
export const initialOperations: Record<string, PrototypeOperation[]> = {
  'action:1001:1': [
    { id: 'demo:advance', kind: 'advance', targets: ['1101'], amount: 25, phase: 'postAction' },
    {
      id: 'demo:speed',
      kind: 'speed',
      targets: ['1001', '1101'],
      mode: 'percent',
      amount: 12,
      duration: { kind: 'turns', turns: 2 },
      phase: 'postAction',
    },
    {
      id: 'demo:event',
      kind: 'event',
      name: '示例事件 / Demo event',
      speed: 90,
      phase: 'postAction',
    },
  ],
  'action:1208:1': [
    { id: 'demo:delay', kind: 'delay', targets: ['1306'], amount: 15, phase: 'preAction' },
  ],
}
