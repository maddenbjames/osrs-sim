export interface TileMarker {
  x: number
  y: number
  label: string
  color: 'red' | 'green'
}

export interface Scenario {
  id: string
  name: string
  description: string
  map: string
  markers: TileMarker[]
  bossSize: number
  bossHp: number
  bossAttackSpeed: number
  playerAttackSpeed: number
  playerRange: number
}

/**
 * Graardor's room, best guess. North is up.
 *
 * Tile markers come from the OSRS wiki's altar-door section (region 11347):
 * columns regionX 48 (west row) and 54 (middle row), rows regionY 42–57.
 * Here grid x = regionX − 47 and grid y = 58 − regionY.
 *
 * Unverified: the exact walls, where the door (south wall) and altar
 * (north wall) sit along them, and Graardor's spawn tile. Edit the ASCII to fix.
 */
const ROOM = `
####A##########
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrBrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
#rrrrrrrrrrrrr#
####D##########
#.......#
#.......#
#########
`

const regionToGrid = (rx: number, ry: number) => ({ x: rx - 47, y: 58 - ry })

const ROW_MARKERS: Array<[number, string, 'red' | 'green']> = [
  [42, 'Shoot-Altar', 'red'],
  [45, 'D', 'green'],
  [48, 'A', 'red'],
  [51, 'D', 'green'],
  [54, 'A', 'red'],
  [57, 'Shoot-Door', 'green'],
]

const markersFor = (regionX: number): TileMarker[] =>
  ROW_MARKERS.map(([ry, label, color]) => ({ ...regionToGrid(regionX, ry), label, color }))

function withStart(map: string, x: number, y: number, ch: string) {
  const rows = map.replace(/^\n+|\n+$/g, '').split('\n')
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1)
  return rows.join('\n')
}

const common = {
  bossSize: 5,
  bossHp: 255,
  bossAttackSpeed: 6,
  playerAttackSpeed: 4,
  playerRange: 10,
}

const middle = regionToGrid(54, 42)

export const SCENARIOS: Scenario[] = [
  {
    id: 'altar-door-middle',
    name: 'Altar-door · middle row',
    description:
      'Standing on the south Shoot-Altar tile as Graardor spawns. Shoot him, click the altar, shoot on the red A tiles, then from Shoot-Door click the door and shoot on the green D tiles. After shooting on A/D, click further along the row (or the wall) to keep running. Done right he never hits you.',
    map: withStart(ROOM, middle.x, middle.y, 'p'),
    markers: [...markersFor(54), ...markersFor(48)],
    ...common,
  },
  {
    id: 'altar-door-west',
    name: 'Altar-door · west row (first kill)',
    description:
      'Start outside the door. Go in, click the west row Shoot-Door tile, shoot as soon as your true tile lands on it, then click the door and follow the same shoot-on-D / shoot-on-A rhythm.',
    map: withStart(ROOM, 4, 18, 'P'),
    markers: [...markersFor(48), ...markersFor(54)],
    ...common,
  },
]
