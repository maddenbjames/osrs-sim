# osrs-sim

A tick-based movement practice simulator for Old School RuneScape style movement tech, in the spirit of scim.gg. All code and visuals are original.

The first scenario drills the **Bandos door → altar → door** run: the boss is dead, the respawn timer is ticking, and you leave the room, pray at the altar and get back in as fast as possible. The sim tells you how many ticks you took versus the optimal route.

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
| Left click tile | Walk / run there (queued for the next tick) |
| Left click door / altar | Path next to it and interact on arrival |
| `Space` | Pause / resume |
| `.` | Step a single tick (pauses) |
| `R` | Toggle run / walk |
| `Esc` | Reset the scenario |

## Mechanics modelled

- 600 ms game ticks; the last click before a tick is the one processed.
- Run = 2 tiles/tick, walk = 1.
- Breadth-first route finder in the game's neighbour order (W, E, S, N, SW, SE, NW, NE), no corner cutting, and the 10-tile "closest reachable tile" fallback when you click somewhere you can't reach.
- Objects are interacted with from an orthogonally adjacent tile, on the tick you arrive.
- A 5×5 boss with simple NPC chase pathing, melee range that excludes the diagonal corners, a 6-tick attack speed, and a respawn timer. Players can walk under it.

## Code layout

```
src/engine/     pure TypeScript game logic (no Vue) — easy to unit test
  map.ts          ASCII map parser
  pathfinding.ts  route finder
  game.ts         tick loop, player, boss, drill scoring
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

The current Bandos layout is an approximation for practice, not a tile-accurate copy of the game room. Adjust it to match the tiles you want to drill.
