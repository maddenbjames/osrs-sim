<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import GameCanvas from './components/GameCanvas.vue'
import { Game, TICK_MS } from './engine/game'
import { SCENARIOS } from './engine/scenarios'
import { optimalRoute } from './engine/optimalRoute'
import type { Tile } from './engine/types'

const scenarioId = ref(SCENARIOS[0].id)
const scenario = computed(() => SCENARIOS.find((s) => s.id === scenarioId.value)!)
const respawnTicks = ref(SCENARIOS[0].respawnTicks)
const running = ref(true)
const speed = ref(1)
const paused = ref(false)
const showGrid = ref(true)
const showMelee = ref(true)
const showTrueTile = ref(true)
const showRoute = ref(false)

const game = shallowRef<Game>(newGame())
/** Bumped whenever the (non-reactive) game state changes so the panels re-render. */
const version = ref(0)
const started = ref(false)
let lastTickAt = performance.now()
let timer: number | undefined

function newGame() {
  return markRaw(new Game(scenario.value, { running: running.value, respawnTicks: respawnTicks.value }))
}

const tickMs = computed(() => TICK_MS / speed.value)

function reset() {
  stopLoop()
  game.value = newGame()
  started.value = false
  paused.value = false
  version.value++
}

function doTick() {
  game.value.step()
  lastTickAt = performance.now()
  version.value++
  const d = game.value.drill
  if (d && (d.finishTick !== null || d.failed)) {
    if (d.finishTick !== null) saveBest()
    stopLoop()
  }
}

function schedule() {
  stopLoop()
  const delay = Math.max(0, lastTickAt + tickMs.value - performance.now())
  timer = window.setTimeout(() => {
    timer = undefined
    if (paused.value) return
    doTick()
    if (!drillOver.value) schedule()
  }, delay)
}

function stopLoop() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function startIfNeeded() {
  if (started.value) return
  started.value = true
  lastTickAt = performance.now()
  schedule()
}

const drillOver = computed(() => {
  void version.value
  const d = game.value.drill
  return !!d && (d.finishTick !== null || !!d.failed)
})

function onTileClick(t: Tile) {
  if (drillOver.value) return
  const g = game.value
  const obj = g.map.objectAt(t.x, t.y)
  g.click(obj ? { type: 'interact', objectId: obj.id } : { type: 'walk', tile: t })
  version.value++
  startIfNeeded()
}

function togglePause() {
  if (!started.value || drillOver.value) return
  paused.value = !paused.value
  if (paused.value) stopLoop()
  else {
    lastTickAt = performance.now()
    schedule()
  }
}

function stepOnce() {
  if (drillOver.value) return
  started.value = true
  paused.value = true
  stopLoop()
  doTick()
}

function toggleRun() {
  running.value = !running.value
  game.value.player.running = running.value
  version.value++
}

const progress = () => (paused.value || !started.value ? 1 : (performance.now() - lastTickAt) / tickMs.value)

// ---- Drill readouts --------------------------------------------------

const BEST_KEY = 'osrs-sim:best'
const bests = ref<Record<string, number>>(loadBests())
function loadBests(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}')
  } catch {
    return {}
  }
}
const bestKey = computed(() => `${scenarioId.value}:${running.value ? 'run' : 'walk'}`)
function saveBest() {
  const t = game.value.drillTicks()
  if (t === null) return
  const prev = bests.value[bestKey.value]
  if (prev === undefined || t < prev) {
    bests.value = { ...bests.value, [bestKey.value]: t }
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(bests.value))
    } catch {
      /* storage unavailable */
    }
  }
}

const view = computed(() => {
  void version.value
  const g = game.value
  return {
    tick: g.tick,
    hits: g.hits,
    drill: g.drill ? { ...g.drill, steps: g.drill.steps.map((s) => ({ ...s })) } : null,
    drillTicks: g.drillTicks(),
    inside: g.playerInside(),
    pos: { ...g.player.pos },
    pending: g.pendingClick,
    log: g.log.slice(-60).reverse(),
    boss: g.boss ? { ...g.boss } : null,
  }
})

const route = computed(() => (showRoute.value ? optimalRoute(game.value.map, game.value.map.playerStart) : []))

const result = computed(() => {
  const v = view.value
  if (!v.drill) return null
  if (v.drill.failed) return { kind: 'bad', text: v.drill.failed }
  if (v.drill.finishTick === null) return null
  const diff = (v.drillTicks ?? 0) - v.drill.optimalTicks
  return diff <= 0
    ? { kind: 'good', text: `Tick perfect! ${v.drillTicks} ticks.` }
    : { kind: 'ok', text: `${v.drillTicks} ticks — ${diff} tick${diff === 1 ? '' : 's'} slower than optimal (${v.drill.optimalTicks}).` }
})

watch([scenarioId, respawnTicks], reset)
watch(running, () => {
  if (!started.value) reset()
})
watch(speed, () => {
  if (started.value && !paused.value && !drillOver.value) schedule()
})

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePause()
  } else if (e.key === 'r' || e.key === 'R') toggleRun()
  else if (e.key === '.' || e.key === 'n') stepOnce()
  else if (e.key === 'Escape' || e.key === 'Backspace') reset()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopLoop()
})
</script>

<template>
  <div class="app">
    <header>
      <h1>Movement Tech Sim</h1>
      <p class="sub">Tick-based OSRS-style movement practice · 600 ms ticks · click to move</p>
    </header>

    <div class="layout">
      <main>
        <div class="toolbar">
          <select v-model="scenarioId">
            <option v-for="s in SCENARIOS" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <button class="primary" @click="reset">Reset <kbd>Esc</kbd></button>
          <button @click="togglePause" :disabled="!started">{{ paused ? 'Resume' : 'Pause' }} <kbd>Space</kbd></button>
          <button @click="stepOnce">Step tick <kbd>.</kbd></button>
          <button @click="toggleRun" :class="{ on: running }">{{ running ? 'Running' : 'Walking' }} <kbd>R</kbd></button>
          <label>
            Speed
            <select v-model.number="speed">
              <option :value="1">100%</option>
              <option :value="0.5">50%</option>
              <option :value="0.25">25%</option>
            </select>
          </label>
        </div>

        <p class="desc">{{ scenario.description }}</p>

        <GameCanvas
          :game="game"
          :progress="progress"
          :show-grid="showGrid"
          :show-melee="showMelee"
          :show-true-tile="showTrueTile"
          :route="route"
          @tile-click="onTileClick"
        />

        <div class="status">
          <span class="pill tick" :key="view.tick">Tick {{ view.tick }}</span>
          <span class="pill">{{ view.inside ? 'Inside boss room' : 'Outside' }}</span>
          <span class="pill">Tile ({{ view.pos.x }}, {{ view.pos.y }})</span>
          <span class="pill" :class="{ bad: view.hits > 0 }">Hits taken {{ view.hits }}</span>
          <span class="pill" v-if="view.pending">Click queued for next tick</span>
          <span class="pill muted" v-if="!started">Click a tile, the door or the altar to start</span>
        </div>

        <div class="toggles">
          <label><input type="checkbox" v-model="showGrid" /> Grid</label>
          <label><input type="checkbox" v-model="showTrueTile" /> True tile</label>
          <label><input type="checkbox" v-model="showMelee" /> Boss melee range</label>
          <label v-if="scenario.drill"><input type="checkbox" v-model="showRoute" /> Show optimal route</label>
        </div>
      </main>

      <aside>
        <section v-if="view.drill" class="card">
          <h2>Drill</h2>
          <label class="inline">
            Respawn timer
            <input type="number" min="5" max="200" v-model.number="respawnTicks" /> ticks
          </label>
          <ol class="steps">
            <li v-for="s in view.drill.steps" :key="s.id" :class="{ done: s.doneTick !== null }">
              <span>{{ s.label }}</span>
              <span class="when" v-if="s.doneTick !== null">tick {{ s.doneTick - (view.drill.startTick ?? 0) }}</span>
            </li>
          </ol>
          <div class="numbers">
            <div><span class="label">Time</span><span class="big">{{ view.drillTicks ?? 0 }}</span></div>
            <div><span class="label">Optimal</span><span class="big">{{ view.drill.optimalTicks }}</span></div>
            <div><span class="label">Best</span><span class="big">{{ bests[bestKey] ?? '–' }}</span></div>
            <div v-if="view.boss && !view.boss.alive"><span class="label">Respawn</span><span class="big">{{ view.boss.respawnIn }}</span></div>
          </div>
          <div v-if="result" class="result" :class="result.kind">{{ result.text }}</div>
        </section>

        <section class="card">
          <h2>Tick log</h2>
          <ul class="log">
            <li v-for="(l, i) in view.log" :key="i" :class="l.kind">
              <span class="t">{{ l.tick }}</span>{{ l.text }}
            </li>
            <li v-if="view.log.length === 0" class="muted">Nothing yet.</li>
          </ul>
        </section>

        <section class="card help">
          <h2>How it works</h2>
          <ul>
            <li>The game runs on 600 ms ticks. A click is queued and acts on the next tick; only your last click before the tick counts.</li>
            <li>Running moves 2 tiles a tick, walking 1. Paths use the game's breadth-first order (W, E, S, N, then diagonals) and can't cut wall corners.</li>
            <li>Clicking the door or altar paths you next to it; the interaction happens on the tick you arrive.</li>
            <li>The boss is 5×5, chases with simple NPC pathing, can't follow through the door, and only hits from directly beside it (not the corners).</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.app { max-width: 1280px; margin: 0 auto; padding: 16px; }
header h1 { margin: 0; font-size: 22px; color: var(--accent); }
.sub { margin: 2px 0 12px; color: var(--muted); font-size: 14px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
@media (max-width: 960px) { .layout { grid-template-columns: 1fr; } }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
.toolbar label { display: flex; gap: 6px; align-items: center; color: var(--muted); }
button.on { border-color: var(--good); }
button:disabled { opacity: 0.5; cursor: default; }
.desc { color: var(--muted); margin: 4px 0 10px; font-size: 14px; max-width: 900px; }
.status, .toggles { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; font-size: 13px; }
.toggles label { color: var(--muted); display: flex; gap: 4px; align-items: center; }
.pill { background: var(--panel); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; }
.pill.bad { border-color: var(--bad); color: var(--bad); }
.pill.muted, .muted { color: var(--muted); }
.pill.tick { animation: pulse 0.3s ease-out; }
@keyframes pulse { from { border-color: var(--accent); background: #3a2f14; } }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.card h2 { margin: 0 0 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.inline { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--muted); }
.inline input { width: 70px; }
.steps { padding-left: 20px; margin: 10px 0; }
.steps li { margin: 4px 0; display: flex; justify-content: space-between; gap: 8px; }
.steps li.done { color: var(--good); }
.when { font-variant-numeric: tabular-nums; color: var(--muted); }
.numbers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.numbers div { background: var(--panel-2); border-radius: 6px; padding: 6px; text-align: center; }
.label { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; }
.big { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.result { margin-top: 10px; padding: 8px 10px; border-radius: 6px; font-weight: 600; }
.result.good { background: rgba(92,196,106,0.15); color: var(--good); }
.result.ok { background: rgba(240,180,41,0.15); color: var(--accent); }
.result.bad { background: rgba(229,83,75,0.15); color: var(--bad); }
.log { list-style: none; padding: 0; margin: 0; max-height: 260px; overflow-y: auto; font-size: 13px; font-family: ui-monospace, monospace; }
.log li { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.log .t { display: inline-block; width: 34px; color: var(--muted); }
.log .hit { color: var(--bad); }
.log .drill { color: var(--good); }
.log .interact { color: var(--info); }
.help ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--muted); }
.help li { margin: 4px 0; }
</style>
