export interface Tile {
  x: number
  y: number
}

export type TileKind = 'floor' | 'wall' | 'void' | 'door' | 'altar' | 'pillar'

export interface GameObject {
  id: string
  kind: 'door' | 'altar'
  /** Top-left tile of the object footprint. */
  x: number
  y: number
  width: number
  height: number
  label: string
}

export const sameTile = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y
export const tileKey = (t: Tile) => `${t.x},${t.y}`
