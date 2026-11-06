import type { TileMap } from './map'
import type { Tile } from './types'

/**
 * OSRS-style breadth-first route finder.
 *
 * Neighbours are expanded in the game's order: W, E, S, N, SW, SE, NW, NE
 * (y grows downwards / south here). A diagonal step is only allowed when both
 * orthogonal tiles it cuts past are walkable, which is what produces the
 * "L-shaped" paths around corners you see in game.
 */
export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], // W
  [1, 0], // E
  [0, 1], // S
  [0, -1], // N
  [-1, 1], // SW
  [1, 1], // SE
  [-1, -1], // NW
  [1, -1], // NE
]

/** Search radius used when the clicked tile can't be reached (matches the game's 10-tile fallback). */
const ALTERNATIVE_RADIUS = 10

export function canStep(map: TileMap, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx
  const ny = y + dy
  if (!map.walkable(nx, ny)) return false
  if (dx !== 0 && dy !== 0) {
    return map.walkable(x + dx, y) && map.walkable(x, y + dy)
  }
  return true
}

interface BfsResult {
  dist: Int32Array
  prev: Int32Array
}

function bfs(map: TileMap, start: Tile, stopAt?: (x: number, y: number) => boolean): BfsResult & { hit: number } {
  const n = map.width * map.height
  const dist = new Int32Array(n).fill(-1)
  const prev = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  const s = start.y * map.width + start.x
  dist[s] = 0
  queue[tail++] = s
  while (head < tail) {
    const cur = queue[head++]
    const cx = cur % map.width
    const cy = (cur - cx) / map.width
    if (stopAt && stopAt(cx, cy)) return { dist, prev, hit: cur }
    for (const [dx, dy] of DIRECTIONS) {
      if (!canStep(map, cx, cy, dx, dy)) continue
      const ni = (cy + dy) * map.width + (cx + dx)
      if (dist[ni] !== -1) continue
      dist[ni] = dist[cur] + 1
      prev[ni] = cur
      queue[tail++] = ni
    }
  }
  return { dist, prev, hit: -1 }
}

function trace(map: TileMap, prev: Int32Array, start: Tile, end: number): Tile[] {
  const path: Tile[] = []
  const s = start.y * map.width + start.x
  let cur = end
  while (cur !== s && cur !== -1) {
    path.push({ x: cur % map.width, y: Math.floor(cur / map.width) })
    cur = prev[cur]
  }
  return path.reverse()
}

/**
 * Path from `start` to any of `goals` (first one reached in BFS order wins).
 * Returns the steps to take, excluding the start tile. `null` if unreachable.
 */
export function findPathToAny(map: TileMap, start: Tile, goals: Tile[]): Tile[] | null {
  if (goals.length === 0) return null
  const goalSet = new Set(goals.map((g) => g.y * map.width + g.x))
  const { prev, hit } = bfs(map, start, (x, y) => goalSet.has(y * map.width + x))
  if (hit === -1) return null
  return trace(map, prev, start, hit)
}

/**
 * Path for a plain "walk here" click. If the clicked tile is blocked or
 * unreachable, falls back to the reachable tile closest to it (within 10
 * tiles), preferring the shortest path on ties — the same idea the game uses.
 */
export function findPath(map: TileMap, start: Tile, dest: Tile): Tile[] {
  const { dist, prev } = bfs(map, start)
  const di = dest.y * map.width + dest.x
  if (map.inBounds(dest.x, dest.y) && dist[di] !== -1) return trace(map, prev, start, di)

  let best = -1
  let bestDistSq = Infinity
  let bestCost = Infinity
  for (let y = dest.y - ALTERNATIVE_RADIUS; y <= dest.y + ALTERNATIVE_RADIUS; y++) {
    for (let x = dest.x - ALTERNATIVE_RADIUS; x <= dest.x + ALTERNATIVE_RADIUS; x++) {
      if (!map.inBounds(x, y)) continue
      const i = y * map.width + x
      if (dist[i] === -1) continue
      const dsq = (x - dest.x) ** 2 + (y - dest.y) ** 2
      if (dsq < bestDistSq || (dsq === bestDistSq && dist[i] < bestCost)) {
        best = i
        bestDistSq = dsq
        bestCost = dist[i]
      }
    }
  }
  return best === -1 ? [] : trace(map, prev, start, best)
}

/** Number of ticks a path of `steps` tiles takes (run = 2 tiles/tick). */
export function ticksForSteps(steps: number, running: boolean): number {
  return running ? Math.ceil(steps / 2) : steps
}
