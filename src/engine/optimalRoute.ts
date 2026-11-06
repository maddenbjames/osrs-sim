import type { TileMap } from './map'
import { findPathToAny } from './pathfinding'
import type { Tile } from './types'

/** The tiles walked on the fastest door → altar → door route, for the overlay. */
export function optimalRoute(map: TileMap, start: Tile): Tile[] {
  const door = map.objects.find((o) => o.kind === 'door')
  const altar = map.objects.find((o) => o.kind === 'altar')
  if (!door || !altar) return []
  const sides = map.interactTiles(door)
  const outside = sides.find((t) => !map.inBossRoom(t.x, t.y))
  if (!outside) return []
  const a = findPathToAny(map, start, sides) ?? []
  const b = findPathToAny(map, outside, map.interactTiles(altar)) ?? []
  const altarTile = b.length ? b[b.length - 1] : outside
  const c = findPathToAny(map, altarTile, sides) ?? []
  return [...a, outside, ...b, ...c]
}
