import { describe, expect, it } from 'vitest'
import { TileMap } from '../src/engine/map'
import { findPath, findPathToAny } from '../src/engine/pathfinding'
import { Game, bossInMelee } from '../src/engine/game'
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

describe('Graardor', () => {
  it('melee range excludes diagonal corners', () => {
    const b = { x: 2, y: 2, size: 5 }
    expect(bossInMelee(b, { x: 1, y: 2 })).toBe(true)
    expect(bossInMelee(b, { x: 1, y: 1 })).toBe(false)
    expect(bossInMelee(b, { x: 7, y: 6 })).toBe(true)
    expect(bossInMelee(b, { x: 7, y: 7 })).toBe(false)
  })

  it('hits every 6 ticks while you stand in melee range', () => {
    const g = new Game(SCENARIOS[0], { seed: 1 })
    g.player.pos = { x: g.boss.x - 1, y: g.boss.y + 2 }
    for (let i = 0; i < 13; i++) g.step()
    expect(g.stats.hitsTaken).toBe(3) // ticks 1, 7, 13
  })

  it('moves before the player each tick (NPCs process first)', () => {
    const g = new Game(SCENARIOS[0], { seed: 1 })
    const b0 = { x: g.boss.x, y: g.boss.y }
    g.click({ type: 'walk', tile: { x: 13, y: 16 } })
    g.step()
    // Boss chased the player's *previous* tile, the player then ran away.
    expect({ x: g.boss.x, y: g.boss.y }).not.toEqual(b0)
    expect(g.player.pos.x).toBe(g.player.prev.x + 2)
  })
})

describe('player', () => {
  it('runs 2 tiles per tick and clicks apply on the next tick', () => {
    const g = new Game(SCENARIOS[0], { seed: 1 })
    const start = { ...g.player.pos }
    g.click({ type: 'walk', tile: { x: start.x + 4, y: start.y } })
    expect(g.player.pos).toEqual(start)
    g.step()
    expect(g.player.pos).toEqual({ x: start.x + 2, y: start.y })
  })

  it('shoots on a 4-tick cycle while standing still', () => {
    const g = new Game(SCENARIOS[0], { seed: 1 })
    g.player.pos = { x: 13, y: 16 }
    g.boss.x = 1
    g.boss.y = 1
    g.click({ type: 'attack' })
    for (let i = 0; i < 9; i++) g.step()
    expect(g.stats.shots).toEqual([1, 5, 9])
    expect(g.shotGaps()).toEqual([4, 4])
    expect(g.perfectStreak()).toBe(2)
  })

  it('red-X on the altar paths up the row and is cancelled by shooting', () => {
    const g = new Game(SCENARIOS[0], { seed: 1 })
    g.boss.x = 9
    g.boss.y = 12
    const altar = g.map.objects.find((o) => o.kind === 'altar')!
    const x0 = g.player.pos.x
    g.click({ type: 'interact', objectId: altar.id })
    g.step()
    g.step()
    g.step()
    expect(g.player.pos).toEqual({ x: x0, y: 10 }) // the first "A" tile, straight up the column
    g.click({ type: 'attack' })
    g.step()
    expect(g.player.pos).toEqual({ x: x0, y: 10 })
    expect(g.player.interaction).toBeNull()
    expect(g.stats.shots.length).toBe(1)
  })

  it('enters the room through the door', () => {
    const g = new Game(SCENARIOS[1], { seed: 1 })
    const door = g.map.objects.find((o) => o.kind === 'door')!
    expect(g.playerInside()).toBe(false)
    g.click({ type: 'interact', objectId: door.id })
    for (let i = 0; i < 3; i++) g.step()
    expect(g.playerInside()).toBe(true)
  })
})
