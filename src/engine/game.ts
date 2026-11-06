import { TileMap } from './map'
import { findPath, findPathToAny, ticksForSteps } from './pathfinding'
import type { GameObject, Tile } from './types'
import { sameTile } from './types'
import type { Scenario } from './scenarios'

export const TICK_MS = 600

export type Click =
  | { type: 'walk'; tile: Tile }
  | { type: 'interact'; objectId: string }
  | { type: 'attack' }

export interface LogEntry {
  tick: number
  text: string
  kind: 'click' | 'interact' | 'shot' | 'hit' | 'info' | 'done'
}

export interface Boss {
  x: number
  y: number
  prevX: number
  prevY: number
  size: number
  hp: number
  maxHp: number
  attackCooldown: number
  attackSpeed: number
}

export interface PlayerState {
  pos: Tile
  prev: Tile
  path: Tile[]
  running: boolean
  interaction: GameObject | null
  /** Attacking the boss (keeps auto-attacking until you click elsewhere). */
  attacking: boolean
  attackCooldown: number
  destination: Tile | null
}

export interface Splat {
  tick: number
  on: 'boss' | 'player'
  amount: number
}

export interface Stats {
  shots: number[]
  hitsTaken: number
  damageTaken: number
}

/** Deterministic PRNG so a run can be replayed and tested. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Game {
  readonly map: TileMap
  readonly scenario: Scenario
  tick = 0
  player: PlayerState
  boss: Boss
  pendingClick: Click | null = null
  log: LogEntry[] = []
  trail: Tile[] = []
  splats: Splat[] = []
  stats: Stats = { shots: [], hitsTaken: 0, damageTaken: 0 }
  finished = false
  private rand: () => number

  constructor(scenario: Scenario, opts: { running?: boolean; seed?: number } = {}) {
    this.scenario = scenario
    this.map = new TileMap(scenario.map)
    this.rand = mulberry32(opts.seed ?? Date.now())
    const start = { ...this.map.playerStart }
    this.player = {
      pos: start,
      prev: { ...start },
      path: [],
      running: opts.running ?? true,
      interaction: null,
      attacking: false,
      attackCooldown: 0,
      destination: null,
    }
    const spawn = this.map.bossSpawn ?? { x: 0, y: 0 }
    this.boss = {
      x: spawn.x,
      y: spawn.y,
      prevX: spawn.x,
      prevY: spawn.y,
      size: scenario.bossSize,
      hp: scenario.bossHp,
      maxHp: scenario.bossHp,
      attackCooldown: 0,
      attackSpeed: scenario.bossAttackSpeed,
    }
  }

  object(id: string) {
    return this.map.objects.find((o) => o.id === id)
  }

  /** Clicks land between ticks; only the latest one before the next tick counts. */
  click(c: Click) {
    if (!this.finished) this.pendingClick = c
  }

  private emit(kind: LogEntry['kind'], text: string) {
    this.log.push({ tick: this.tick, text, kind })
    if (this.log.length > 300) this.log.shift()
  }

  playerInside() {
    return this.map.inBossRoom(this.player.pos.x, this.player.pos.y)
  }

  underBoss(t: Tile = this.player.pos) {
    const b = this.boss
    return t.x >= b.x && t.x < b.x + b.size && t.y >= b.y && t.y < b.y + b.size
  }

  /** Chebyshev distance from a tile to the nearest tile of the boss. */
  distanceToBoss(t: Tile = this.player.pos) {
    const b = this.boss
    const dx = Math.max(b.x - t.x, 0, t.x - (b.x + b.size - 1))
    const dy = Math.max(b.y - t.y, 0, t.y - (b.y + b.size - 1))
    return Math.max(dx, dy)
  }

  /**
   * One game tick. NPCs are processed before players (as in the game), so
   * Graardor reacts to where you stood at the end of the previous tick.
   */
  step() {
    if (this.finished) return
    this.tick++
    const p = this.player
    p.prev = { ...p.pos }
    this.boss.prevX = this.boss.x
    this.boss.prevY = this.boss.y
    if (p.attackCooldown > 0) p.attackCooldown--
    if (this.boss.attackCooldown > 0) this.boss.attackCooldown--

    this.stepBoss()

    if (this.pendingClick) {
      this.processClick(this.pendingClick)
      this.pendingClick = null
    }

    if (p.attacking) {
      this.stepAttack()
    } else if (!this.tryInteract()) {
      this.move()
      this.tryInteract()
    }

    this.trail.push({ ...p.pos })
    if (this.trail.length > 14) this.trail.shift()
    this.splats = this.splats.filter((s) => this.tick - s.tick < 2)
  }

  private move() {
    const p = this.player
    const stride = p.running ? 2 : 1
    for (let i = 0; i < stride && p.path.length > 0; i++) p.pos = p.path.shift()!
    if (p.path.length === 0 && !p.interaction) p.destination = null
  }

  private processClick(c: Click) {
    const p = this.player
    p.attacking = false
    p.interaction = null
    if (c.type === 'attack') {
      p.attacking = true
      p.path = []
      p.destination = null
      this.emit('click', 'Clicked Graardor')
      return
    }
    if (c.type === 'walk') {
      p.path = findPath(this.map, p.pos, c.tile)
      p.destination = p.path.length ? p.path[p.path.length - 1] : null
      this.emit('click', `Move (${c.tile.x}, ${c.tile.y}) · ${p.path.length} tiles, ${ticksForSteps(p.path.length, p.running)} ticks`)
      return
    }
    const obj = this.object(c.objectId)
    if (!obj) return
    const goals = this.map.interactTiles(obj)
    const path = goals.some((g) => sameTile(g, p.pos)) ? [] : findPathToAny(this.map, p.pos, goals)
    if (path === null) {
      p.path = []
      this.emit('info', `Can't reach ${obj.label}`)
      return
    }
    p.interaction = obj
    p.path = path
    p.destination = path.length ? path[path.length - 1] : { ...p.pos }
    this.emit('click', `Red-X ${obj.label} · ${path.length} tiles away`)
  }

  private stepAttack() {
    const p = this.player
    if (this.underBoss()) {
      // You can't shoot from underneath a large NPC: step out to the nearest free tile first.
      const out: Tile[] = []
      const b = this.boss
      for (let y = b.y - 1; y <= b.y + b.size; y++) {
        for (let x = b.x - 1; x <= b.x + b.size; x++) {
          if (!this.underBoss({ x, y }) && this.map.walkable(x, y)) out.push({ x, y })
        }
      }
      p.path = findPathToAny(this.map, p.pos, out) ?? []
      this.move()
      return
    }
    if (this.distanceToBoss() > this.scenario.playerRange) {
      const path = findPath(this.map, p.pos, { x: this.boss.x + 2, y: this.boss.y + 2 })
      p.path = path
      this.move()
      return
    }
    p.path = []
    if (p.attackCooldown > 0) return
    const dmg = Math.floor(this.rand() * 42)
    this.boss.hp = Math.max(0, this.boss.hp - dmg)
    p.attackCooldown = this.scenario.playerAttackSpeed
    const last = this.stats.shots[this.stats.shots.length - 1]
    this.stats.shots.push(this.tick)
    this.splats.push({ tick: this.tick, on: 'boss', amount: dmg })
    this.emit('shot', `Shot Graardor for ${dmg}${last !== undefined ? ` · ${this.tick - last} ticks since last shot` : ''}`)
    if (this.boss.hp === 0) {
      this.finished = true
      this.emit('done', `Graardor dead in ${this.tick} ticks, ${this.stats.hitsTaken} hits taken`)
    }
  }

  private tryInteract(): boolean {
    const p = this.player
    const obj = p.interaction
    if (!obj || p.path.length > 0) return false
    if (!this.map.interactTiles(obj).some((t) => sameTile(t, p.pos))) return false
    if (obj.kind === 'door') {
      const other = this.map.interactTiles(obj).find((t) => !sameTile(t, p.pos))
      if (other) {
        const wasInside = this.playerInside()
        p.pos = { ...other }
        this.emit('interact', wasInside ? 'Left through the door' : 'Entered through the door')
      }
    } else {
      this.emit('interact', 'Reached the altar')
    }
    p.interaction = null
    p.destination = null
    return true
  }

  // ---- Graardor --------------------------------------------------------

  private bossFits(x: number, y: number) {
    const s = this.boss.size
    for (let ty = y; ty < y + s; ty++) {
      for (let tx = x; tx < x + s; tx++) {
        if (!this.map.walkable(tx, ty) || !this.map.inBossRoom(tx, ty)) return false
      }
    }
    return true
  }

  private stepBoss() {
    const b = this.boss
    const { x: px, y: py } = this.player.pos
    if (b.hp <= 0 || !this.map.inBossRoom(px, py)) return
    const s = b.size

    if (this.underBoss()) {
      // Large NPCs step out in a random cardinal direction when you're underneath.
      const dirs = [[-1, 0], [1, 0], [0, 1], [0, -1]] as const
      const start = Math.floor(this.rand() * 4)
      for (let i = 0; i < 4; i++) {
        const [dx, dy] = dirs[(start + i) % 4]
        if (this.bossFits(b.x + dx, b.y + dy)) {
          b.x += dx
          b.y += dy
          break
        }
      }
      return
    }

    if (bossInMelee(b, this.player.pos)) {
      if (b.attackCooldown === 0) {
        const dmg = 1 + Math.floor(this.rand() * 35)
        this.stats.hitsTaken++
        this.stats.damageTaken += dmg
        b.attackCooldown = b.attackSpeed
        this.splats.push({ tick: this.tick, on: 'player', amount: dmg })
        this.emit('hit', `Graardor hits you for ${dmg}`)
      }
      return
    }

    const dx = px < b.x ? -1 : px > b.x + s - 1 ? 1 : 0
    const dy = py < b.y ? -1 : py > b.y + s - 1 ? 1 : 0
    const cornerOnly = dx !== 0 && dy !== 0 && (px === b.x - 1 || px === b.x + s) && (py === b.y - 1 || py === b.y + s)
    const tries: Array<[number, number]> = []
    if (dx !== 0 && dy !== 0 && !cornerOnly) tries.push([dx, dy])
    if (dx !== 0) tries.push([dx, 0])
    if (dy !== 0) tries.push([0, dy])
    for (const [mx, my] of tries) {
      const diagonalOk = mx === 0 || my === 0 || (this.bossFits(b.x + mx, b.y) && this.bossFits(b.x, b.y + my))
      if (diagonalOk && this.bossFits(b.x + mx, b.y + my)) {
        b.x += mx
        b.y += my
        break
      }
    }
  }

  /** Gaps between consecutive shots; 4 is a perfect cycle with a 4-tick weapon. */
  shotGaps(): number[] {
    const s = this.stats.shots
    return s.slice(1).map((t, i) => t - s[i])
  }

  perfectStreak(): number {
    const gaps = this.shotGaps()
    let n = 0
    for (let i = gaps.length - 1; i >= 0 && gaps[i] === this.scenario.playerAttackSpeed; i--) n++
    return n
  }
}

export function bossInMelee(b: Pick<Boss, 'x' | 'y' | 'size'>, t: Tile) {
  const s = b.size
  const withinX = t.x >= b.x && t.x < b.x + s
  const withinY = t.y >= b.y && t.y < b.y + s
  return (withinX && (t.y === b.y - 1 || t.y === b.y + s)) || (withinY && (t.x === b.x - 1 || t.x === b.x + s))
}
