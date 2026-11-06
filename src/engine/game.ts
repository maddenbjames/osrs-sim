import { TileMap } from './map'
import { findPath, findPathToAny, ticksForSteps } from './pathfinding'
import type { GameObject, Tile } from './types'
import { sameTile } from './types'
import type { Scenario } from './scenarios'

export const TICK_MS = 600

export type Click = { type: 'walk'; tile: Tile } | { type: 'interact'; objectId: string }

export interface LogEntry {
  tick: number
  text: string
  kind: 'click' | 'move' | 'interact' | 'boss' | 'hit' | 'drill' | 'info'
}

export interface Boss {
  x: number
  y: number
  size: number
  alive: boolean
  respawnIn: number
  attackCooldown: number
  attackSpeed: number
}

export interface DrillStep {
  id: 'exit' | 'altar' | 'enter'
  label: string
  doneTick: number | null
}

export interface DrillState {
  steps: DrillStep[]
  startTick: number | null
  finishTick: number | null
  failed: string | null
  optimalTicks: number
}

export interface PlayerState {
  pos: Tile
  prev: Tile
  path: Tile[]
  running: boolean
  interaction: GameObject | null
  /** Tile the player was told to walk to (the "flag"). */
  destination: Tile | null
}

export class Game {
  readonly map: TileMap
  readonly scenario: Scenario
  tick = 0
  player: PlayerState
  boss: Boss | null
  hits = 0
  pendingClick: Click | null = null
  log: LogEntry[] = []
  trail: Tile[] = []
  drill: DrillState | null

  constructor(scenario: Scenario, opts: { running?: boolean; bossAlive?: boolean; respawnTicks?: number } = {}) {
    this.scenario = scenario
    this.map = new TileMap(scenario.map)
    const start = { ...this.map.playerStart }
    this.player = {
      pos: start,
      prev: { ...start },
      path: [],
      running: opts.running ?? true,
      interaction: null,
      destination: null,
    }
    const spawn = this.map.bossSpawn
    const bossAlive = opts.bossAlive ?? scenario.bossAlive
    this.boss = spawn
      ? {
          x: spawn.x,
          y: spawn.y,
          size: scenario.bossSize,
          alive: bossAlive,
          respawnIn: bossAlive ? 0 : (opts.respawnTicks ?? scenario.respawnTicks),
          attackCooldown: 0,
          attackSpeed: scenario.bossAttackSpeed,
        }
      : null
    this.drill = scenario.drill
      ? {
          steps: [
            { id: 'exit', label: 'Leave through the door', doneTick: null },
            { id: 'altar', label: 'Pray at the altar', doneTick: null },
            { id: 'enter', label: 'Get back through the door', doneTick: null },
          ],
          startTick: null,
          finishTick: null,
          failed: null,
          optimalTicks: optimalDrillTicks(this.map, start, this.player.running),
        }
      : null
  }

  object(id: string) {
    return this.map.objects.find((o) => o.id === id)
  }

  /** Clicks land between ticks; only the latest one before the next tick counts. */
  click(c: Click) {
    this.pendingClick = c
  }

  private emit(kind: LogEntry['kind'], text: string) {
    this.log.push({ tick: this.tick, text, kind })
    if (this.log.length > 300) this.log.shift()
  }

  /** Is the player inside the boss room? */
  playerInside() {
    return this.map.inBossRoom(this.player.pos.x, this.player.pos.y)
  }

  step() {
    this.tick++
    const p = this.player
    p.prev = { ...p.pos }

    // 1. Process the click queued since the last tick.
    if (this.pendingClick) {
      this.processClick(this.pendingClick)
      this.pendingClick = null
    }

    // 2. Interact if already in reach, otherwise move then try again.
    if (!this.tryInteract()) {
      const stride = p.running ? 2 : 1
      for (let i = 0; i < stride && p.path.length > 0; i++) {
        p.pos = p.path.shift()!
      }
      if (p.path.length === 0 && !p.interaction) p.destination = null
      this.tryInteract()
    }

    this.trail.push({ ...p.pos })
    if (this.trail.length > 12) this.trail.shift()

    // 3. Boss.
    this.stepBoss()

    // 4. Drill bookkeeping.
    this.checkDrill()
  }

  private processClick(c: Click) {
    const p = this.player
    if (this.drill && this.drill.startTick === null) {
      this.drill.startTick = this.tick - 1
      this.emit('drill', 'Drill timer started')
    }
    if (c.type === 'walk') {
      p.interaction = null
      p.path = findPath(this.map, p.pos, c.tile)
      p.destination = p.path.length ? p.path[p.path.length - 1] : null
      this.emit('click', `Walk to (${c.tile.x}, ${c.tile.y}) — ${p.path.length} tiles, ${ticksForSteps(p.path.length, p.running)} ticks`)
      return
    }
    const obj = this.object(c.objectId)
    if (!obj) return
    const goals = this.map.interactTiles(obj)
    const path = goals.some((g) => sameTile(g, p.pos)) ? [] : findPathToAny(this.map, p.pos, goals)
    if (path === null) {
      p.interaction = null
      p.path = []
      this.emit('info', `Can't reach ${obj.label}`)
      return
    }
    p.interaction = obj
    p.path = path
    p.destination = path.length ? path[path.length - 1] : { ...p.pos }
    this.emit('click', `Clicked ${obj.label} — ${path.length} tiles away`)
  }

  private tryInteract(): boolean {
    const p = this.player
    const obj = p.interaction
    if (!obj || p.path.length > 0) return false
    if (!this.map.interactTiles(obj).some((t) => sameTile(t, p.pos))) return false

    if (obj.kind === 'door') {
      const sides = this.map.interactTiles(obj)
      const other = sides.find((t) => !sameTile(t, p.pos))
      if (other) {
        const wasInside = this.playerInside()
        p.pos = { ...other }
        this.emit('interact', wasInside ? 'Squeezed out through the door' : 'Went in through the door')
        this.onDoor(wasInside)
      }
    } else if (obj.kind === 'altar') {
      this.emit('interact', 'Prayed at the altar — prayer restored')
      this.onAltar()
    }
    p.interaction = null
    p.destination = null
    return true
  }

  // ---- Boss -------------------------------------------------------------

  private bossFits(x: number, y: number, size: number) {
    for (let ty = y; ty < y + size; ty++) {
      for (let tx = x; tx < x + size; tx++) {
        if (!this.map.walkable(tx, ty) || !this.map.inBossRoom(tx, ty)) return false
      }
    }
    return true
  }

  private stepBoss() {
    const b = this.boss
    if (!b) return
    if (!b.alive) {
      b.respawnIn--
      if (b.respawnIn <= 0) {
        b.alive = true
        b.attackCooldown = 0
        const spawn = this.map.bossSpawn!
        b.x = spawn.x
        b.y = spawn.y
        this.emit('boss', 'The boss has respawned')
      }
      return
    }
    if (b.attackCooldown > 0) b.attackCooldown--
    const { x: px, y: py } = this.player.pos
    if (!this.map.inBossRoom(px, py)) return

    const s = b.size
    const under = px >= b.x && px < b.x + s && py >= b.y && py < b.y + s
    if (under) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1]] as const) {
        if (this.bossFits(b.x + dx, b.y + dy, s)) {
          b.x += dx
          b.y += dy
          break
        }
      }
      return
    }

    if (bossInMelee(b, this.player.pos)) {
      if (b.attackCooldown === 0) {
        this.hits++
        b.attackCooldown = b.attackSpeed
        this.emit('hit', 'The boss hits you!')
      }
      return
    }

    const dx = px < b.x ? -1 : px > b.x + s - 1 ? 1 : 0
    const dy = py < b.y ? -1 : py > b.y + s - 1 ? 1 : 0
    const cornerOnly =
      dx !== 0 && dy !== 0 && (px === b.x - 1 || px === b.x + s) && (py === b.y - 1 || py === b.y + s)
    const tries: Array<[number, number]> = []
    if (dx !== 0 && dy !== 0 && !cornerOnly) tries.push([dx, dy])
    if (dx !== 0) tries.push([dx, 0])
    if (dy !== 0) tries.push([0, dy])
    for (const [mx, my] of tries) {
      const diagonalOk = mx === 0 || my === 0 || (this.bossFits(b.x + mx, b.y, s) && this.bossFits(b.x, b.y + my, s))
      if (diagonalOk && this.bossFits(b.x + mx, b.y + my, s)) {
        b.x += mx
        b.y += my
        break
      }
    }
  }

  // ---- Drill ------------------------------------------------------------

  private markStep(id: DrillStep['id']) {
    const d = this.drill
    if (!d || d.finishTick !== null || d.failed) return
    const idx = d.steps.findIndex((s) => s.doneTick === null)
    if (idx === -1 || d.steps[idx].id !== id) return
    d.steps[idx].doneTick = this.tick
    if (idx === d.steps.length - 1) {
      d.finishTick = this.tick
      const taken = this.tick - (d.startTick ?? 0)
      const diff = taken - d.optimalTicks
      this.emit('drill', `Done in ${taken} ticks (${diff === 0 ? 'tick perfect!' : `+${diff} vs optimal ${d.optimalTicks}`})`)
    }
  }

  private onDoor(wasInside: boolean) {
    this.markStep(wasInside ? 'exit' : 'enter')
  }

  private onAltar() {
    this.markStep('altar')
  }

  private checkDrill() {
    const d = this.drill
    if (!d || d.finishTick !== null || d.failed || d.startTick === null) return
    if (this.boss?.alive && !this.scenario.bossAlive) {
      d.failed = 'The boss respawned before you got back in'
      this.emit('drill', d.failed)
    }
  }

  drillTicks(): number | null {
    const d = this.drill
    if (!d || d.startTick === null) return null
    return (d.finishTick ?? this.tick) - d.startTick
  }
}

export function bossInMelee(b: Pick<Boss, 'x' | 'y' | 'size'>, t: Tile) {
  const s = b.size
  const withinX = t.x >= b.x && t.x < b.x + s
  const withinY = t.y >= b.y && t.y < b.y + s
  return (withinX && (t.y === b.y - 1 || t.y === b.y + s)) || (withinY && (t.x === b.x - 1 || t.x === b.x + s))
}

/**
 * Best possible tick count for the door → altar → door drill, assuming
 * perfect clicks: each leg costs ceil(steps / 2) ticks running (min 1, since
 * the interaction itself takes the tick you arrive on).
 */
export function optimalDrillTicks(map: TileMap, start: Tile, running: boolean): number {
  const door = map.objects.find((o) => o.kind === 'door')
  const altar = map.objects.find((o) => o.kind === 'altar')
  if (!door || !altar) return 0
  const legCost = (steps: number) => Math.max(1, ticksForSteps(steps, running))
  const sides = map.interactTiles(door)
  const inside = sides.find((t) => map.inBossRoom(t.x, t.y))
  const outside = sides.find((t) => !map.inBossRoom(t.x, t.y))
  if (!inside || !outside) return 0

  const toDoor = findPathToAny(map, start, sides)
  const toAltar = findPathToAny(map, outside, map.interactTiles(altar))
  if (!toDoor || !toAltar) return 0
  const altarTile = toAltar.length ? toAltar[toAltar.length - 1] : outside
  const back = findPathToAny(map, altarTile, sides)
  if (!back) return 0
  return legCost(toDoor.length) + legCost(toAltar.length) + legCost(back.length)
}
