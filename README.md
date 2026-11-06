# osrs-sim

A tick-based movement practice simulator for Old School RuneScape style movement tech, in the spirit of scim.gg. All code and visuals are original.

The first scenario drills the **Bandos altar-door method**: a solo ranged kiting method where you shoot General Graardor with a 4-tick weapon, then red-X the altar or the door at either end of the room. You shoot on the marked A and D tiles so Graardor never gets an attack off. Tile markers follow the OSRS wiki's altar-door section. The room walls, door and altar positions, and Graardor's spawn are a best guess for now.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests (vitest)
npm run build    # type-check + production build
```

## Controls

| Input | Action |
| --- | --- |
| Click Graardor | Shoot (4-tick cycle, stops your movement) |
| Click door / altar | Red-X: path toward it |
| Click tile | Run / walk there |
| `Space` | Pause / resume |
| `.` | Step a single tick (pauses) |
| `R` | Toggle run / walk |
| `Esc` | Reset |

## Mechanics modelled

- 600 ms game ticks; the last click before a tick is the one processed.
- NPCs are processed before the player each tick.
- Run = 2 tiles/tick, walk = 1. Breadth-first route finder in the game's neighbour order (W, E, S, N, SW, SE, NW, NE), no corner cutting, 10-tile closest-reachable fallback.
- Player bow: 4-tick attack speed, range 10, can't shoot from under Graardor (steps out first).
- Graardor: 5×5, 6-tick attack speed, chases with simple NPC pathing, hits only from directly beside him (not corners), steps out in a random direction when you're underneath.
- Damage numbers are random and only there for feedback.

## Code layout

```
src/engine/     pure TypeScript game logic (no Vue) — easy to unit test
  map.ts          ASCII map parser
  pathfinding.ts  route finder
  game.ts         tick loop, player, Graardor, shot timing stats
  scenarios.ts    scenario definitions (edit the ASCII map here)
src/components/GameCanvas.vue   canvas renderer + click handling
src/App.vue                     controls, drill panel, tick log
tests/                          vitest specs for the engine
```

### Editing the map

Scenarios are ASCII in `src/engine/scenarios.ts`:

```
.  floor        #  wall       (space) void     o  pillar
D  door         A  altar
P  player start p  player start inside the boss room
r  boss-room floor            B  boss spawn (top-left of footprint)
```

Tile markers are listed per scenario in the same file (grid x = regionX − 47, grid y = 58 − regionY). The room layout is an approximation; adjust the ASCII once the real walls, door, altar and spawn are confirmed.
