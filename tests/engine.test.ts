import { describe, expect, it } from 'vitest'
import { TileMap } from '../src/engine/map'
import { findPath, findPathToAny } from '../src/engine/pathfinding'
import { Game, bossInMelee, optimalDrillTicks } from '../src/engine/game'
import { SCENARIOS } from '../src/engine/scenarios'

const open = new TileMap(`
.......
.......
.......
.......
`)

describe('pathfinding', () => {
  it('follows the W,E,S,N,SW,SE,NW,NE BFS order (straight, then diagonal)', () => {
    const path = findPath(open, { x: 0, y: 0 }, { x: 4, y: 2 })
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 1 },
      { x: 4, y: 2 },
    ])
  })

  it('does not cut corners past walls', () => {
    const map = new TileMap(`
...
.#.
...
`)
    const path = findPath(map, { x: 0, y: 1 }, { x: 1, y: 0 })
    // Can't go diagonally NE because (1,1) is a wall: must go N then E.
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ])
  })

  it('falls back to the closest reachable tile when the click is blocked', () => {
    const map = new TileMap(`
.....
.###.
.#.#.
.###.
`)
    const path = findPath(map, { x: 0, y: 0 }, { x: 2, y: 2 })
    const end = path[path.length - 1]
    expect((end.x - 2) ** 2 + (end.y - 2) ** 2).toBe(4)
  })

  it('paths to the nearest interaction tile', () => {
    const map = new TileMap(`
.....
..A..
.....
`)
    const altar = map.objects[0]
    const path = findPathToAny(map, { x: 0, y: 1 }, map.interactTiles(altar))
    expect(path).toEqual([{ x: 1, y: 1 }])
  })
})

describe('boss', () => {
  it('melee range excludes diagonal corners', () => {
    const b = { x: 2, y: 2, size: 5 }
    expect(bossInMelee(b, { x: 1, y: 2 })).toBe(true)
    expect(bossInMelee(b, { x: 1, y: 1 })).toBe(false)
    expect(bossInMelee(b, { x: 7, y: 6 })).toBe(true)
    expect(bossInMelee(b, { x: 7, y: 7 })).toBe(false)
  })

  it('chases and hits a player standing in the room', () => {
    const g = new Game(SCENARIOS[1])
    for (let i = 0; i < 10; i++) g.step()
    expect(g.hits).toBeGreaterThan(0)
  })
})

describe('door → altar drill', () => {
  it('runs 2 tiles per tick and clicks apply on the next tick', () => {
    const g = new Game(SCENARIOS[0])
    const start = { ...g.player.pos }
    g.click({ type: 'walk', tile: { x: start.x + 4, y: start.y } })
    expect(g.player.pos).toEqual(start)
    g.step()
    expect(g.player.pos).toEqual({ x: start.x + 2, y: start.y })
  })

  it('completes in the optimal tick count with perfect clicks', () => {
    const g = new Game(SCENARIOS[0])
    const door = g.map.objects.find((o) => o.kind === 'door')!
    const altar = g.map.objects.find((o) => o.kind === 'altar')!
    const doClick = (id: string, guard: () => boolean) => {
      g.click({ type: 'interact', objectId: id })
      for (let i = 0; i < 50 && !guard(); i++) g.step()
    }
    doClick(door.id, () => g.drill!.steps[0].doneTick !== null)
    doClick(altar.id, () => g.drill!.steps[1].doneTick !== null)
    doClick(door.id, () => g.drill!.steps[2].doneTick !== null)
    expect(g.drill!.failed).toBeNull()
    expect(g.drillTicks()).toBe(g.drill!.optimalTicks)
    expect(g.playerInside()).toBe(true)
    expect(g.drill!.optimalTicks).toBe(optimalDrillTicks(g.map, g.map.playerStart, true))
  })

  it('fails when the boss respawns first', () => {
    const g = new Game(SCENARIOS[0], { respawnTicks: 3 })
    g.click({ type: 'walk', tile: { x: 20, y: 7 } })
    for (let i = 0; i < 5; i++) g.step()
    expect(g.drill!.failed).not.toBeNull()
  })
})
