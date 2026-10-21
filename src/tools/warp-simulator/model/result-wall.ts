const radians = (-12 * Math.PI) / 180
export const wallCard = { width: 320, height: 160, angle: -12 } as const
const rotatedWidth =
  Math.abs(Math.cos(radians)) * wallCard.width + Math.abs(Math.sin(radians)) * wallCard.height
const rotatedHeight =
  Math.abs(Math.sin(radians)) * wallCard.width + Math.abs(Math.cos(radians)) * wallCard.height
const centers = [3, 4, 3].flatMap((count, row) =>
  Array.from({ length: count }, (_, column) => {
    const x = (column - (count - 1) / 2) * 348
    return { x, y: row * 250 + x * Math.tan(radians) }
  }),
)
const padding = 48
const minX = Math.min(...centers.map((c) => c.x - rotatedWidth / 2)) - padding
const minY = Math.min(...centers.map((c) => c.y - rotatedHeight / 2)) - padding
export const resultWall = {
  width: Math.max(...centers.map((c) => c.x + rotatedWidth / 2)) + padding - minX,
  height: Math.max(...centers.map((c) => c.y + rotatedHeight / 2)) + padding - minY,
  slots: centers.map((c, index) => ({
    left: c.x - minX - wallCard.width / 2,
    top: c.y - minY - wallCard.height / 2,
    centerX: c.x - minX,
    centerY: c.y - minY,
    rotatedWidth,
    rotatedHeight,
    zIndex: index + 1,
  })),
} as const
export function fitResultWall(width: number, height: number) {
  return Math.max(0, Math.min(1, width / resultWall.width, height / resultWall.height))
}
