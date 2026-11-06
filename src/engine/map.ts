import type { GameObject, Tile, TileKind } from './types'

/**
 * A rectangular tile map parsed from ASCII.
 *
 * Legend:
 *   .  floor          #  wall          (space) void
 *   o  pillar         D  door          A  altar
 *   P  player start (floor)            p  player start inside the boss room
 *   B  boss spawn, top-left of footprint (boss-room floor)
 *   r  boss-room floor (the area the boss is allowed to walk in / aggro from)
 */
export class TileMap {
  readonly width: number
  readonly height: number
  readonly kinds: TileKind[]
  readonly bossRoom: boolean[]
  readonly objects: GameObject[] = []
  playerStart: Tile = { x: 0, y: 0 }
  bossSpawn: Tile | null = null

  constructor(ascii: string) {
    const rows = ascii.replace(/^\n+|\n+$/g, '').split('\n')
    this.height = rows.length
    this.width = Math.max(...rows.map((r) => r.length))
    this.kinds = new Array(this.width * this.height).fill('void')
    this.bossRoom = new Array(this.width * this.height).fill(false)

    rows.forEach((row, y) => {
      for (let x = 0; x < this.width; x++) {
        const ch = row[x] ?? ' '
        const i = y * this.width + x
        switch (ch) {
          case '.':
            this.kinds[i] = 'floor'
            break
          case 'r':
            this.kinds[i] = 'floor'
            this.bossRoom[i] = true
            break
          case '#':
            this.kinds[i] = 'wall'
            break
          case 'o':
            this.kinds[i] = 'pillar'
            break
          case 'D':
            this.kinds[i] = 'door'
            this.objects.push({ id: `door-${this.objects.length}`, kind: 'door', x, y, width: 1, height: 1, label: 'Big door' })
            break
          case 'A':
            this.kinds[i] = 'altar'
            this.objects.push({ id: `altar-${this.objects.length}`, kind: 'altar', x, y, width: 1, height: 1, label: 'Altar' })
            break
          case 'P':
            this.kinds[i] = 'floor'
            this.playerStart = { x, y }
            break
          case 'p':
            this.kinds[i] = 'floor'
            this.bossRoom[i] = true
            this.playerStart = { x, y }
            break
          case 'B':
            this.kinds[i] = 'floor'
            this.bossRoom[i] = true
            this.bossSpawn = { x, y }
            break
          default:
            this.kinds[i] = 'void'
        }
      }
    })
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height
  }

  kind(x: number, y: number): TileKind {
    return this.inBounds(x, y) ? this.kinds[y * this.width + x] : 'void'
  }

  walkable(x: number, y: number) {
    return this.kind(x, y) === 'floor'
  }

  inBossRoom(x: number, y: number) {
    return this.inBounds(x, y) && this.bossRoom[y * this.width + x]
  }

  objectAt(x: number, y: number): GameObject | undefined {
    return this.objects.find((o) => x >= o.x && x < o.x + o.width && y >= o.y && y < o.y + o.height)
  }

  /** Walkable tiles orthogonally adjacent to an object's footprint (where you can interact from). */
  interactTiles(obj: GameObject): Tile[] {
    const out: Tile[] = []
    for (let x = obj.x; x < obj.x + obj.width; x++) {
      out.push({ x, y: obj.y - 1 }, { x, y: obj.y + obj.height })
    }
    for (let y = obj.y; y < obj.y + obj.height; y++) {
      out.push({ x: obj.x - 1, y }, { x: obj.x + obj.width, y })
    }
    return out.filter((t) => this.walkable(t.x, t.y))
  }
}
