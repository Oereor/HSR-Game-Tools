import type { SolveReply, SolveRequest } from './session'
import { compileMap } from '../engine/step'
import { solve } from '../engine/solve'

self.onmessage = ({ data }: MessageEvent<SolveRequest>) => {
  const { id, map, limits } = data
  const reply: SolveReply = { id, result: solve(compileMap(map), limits) }
  self.postMessage(reply)
}
