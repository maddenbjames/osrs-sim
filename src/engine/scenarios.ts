export interface Scenario {
  id: string
  name: string
  description: string
  map: string
  bossSize: number
  bossAlive: boolean
  respawnTicks: number
  bossAttackSpeed: number
  drill: boolean
}

/**
 * Bandos-style layout: an antechamber with an altar (west) and the boss room
 * (east) joined by a single door. The geometry is an approximation for
 * practice — edit the ASCII below to match the real tiles you want to drill.
 */
const BANDOS_MAP = `
############################
#..........#rrrrrrrrrrrrrrr#
#..........#rrrrrrrrrrrrrrr#
#...A......#rrrrrrrrrrrrrrr#
#..........#rrrrrrrrrrrrrrr#
#..........#rrrrrrrrrrrrrrr#
#..........#rrrrrrrrrrrrrrr#
#..........Drrrrprrrrrrrrrr#
#..........#rrrrrrrrrrrrrrr#
#..........#rrrrrrrBrrrrrrr#
#..........#rrrrrrrrrrrrrrr#
#..........#rrrrrrrrrrrrrrr#
############rrrrrrrrrrrrrrr#
           #rrrrrrrrrrrrrrr#
           #rrrrrrrrrrrrrrr#
           #################
`

export const SCENARIOS: Scenario[] = [
  {
    id: 'bandos-door-altar',
    name: 'Bandos door → altar → door',
    description:
      'Boss is dead and the respawn timer is running. Leave through the door, pray at the altar and get back in before it respawns — in as few ticks as possible.',
    map: BANDOS_MAP,
    bossSize: 5,
    bossAlive: false,
    respawnTicks: 30,
    bossAttackSpeed: 6,
    drill: true,
  },
  {
    id: 'bandos-sandbox',
    name: 'Bandos sandbox (boss alive)',
    description:
      'Free movement with a 5×5 boss that chases you with simple NPC pathing and hits when you are in melee range. Practise stepping under, around corners and out the door.',
    map: BANDOS_MAP,
    bossSize: 5,
    bossAlive: true,
    respawnTicks: 30,
    bossAttackSpeed: 6,
    drill: false,
  },
]
