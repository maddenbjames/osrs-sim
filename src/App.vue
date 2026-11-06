<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import GameCanvas from './components/GameCanvas.vue'
import { Game, TICK_MS } from './engine/game'
import { SCENARIOS } from './engine/scenarios'
import type { Tile } from './engine/types'

const scenarioId = ref(SCENARIOS[0].id)
const scenario = computed(() => SCENARIOS.find((s) => s.id === scenarioId.value)!)
const running = ref(true)
const speed = ref(1)
const paused = ref(false)
const showGrid = ref(true)
const showMelee = ref(true)
const showMarkers = ref(true)

const game = shallowRef<Game>(newGame())
/** Bumped whenever the (non-reactive) game changes so the panels re-render. */
const version = ref(0)
const started = ref(false)
let lastTickAt = performance.now()
let timer: number | undefined

function newGame() {
  return markRaw(new Game(scenario.value, { running: running.value }))
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
  if (game.value.finished) stopLoop()
}

function schedule() {
  stopLoop()
  const delay = Math.max(0, lastTickAt + tickMs.value - performance.now())
  timer = window.setTimeout(() => {
    timer = undefined
    if (paused.value) return
    doTick()
    if (!game.value.finished) schedule()
  }, delay)
}

function stopLoop() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function onTileClick(t: Tile) {
  const g = game.value
  if (g.finished) return
  const obj = g.map.objectAt(t.x, t.y)
  if (obj) g.click({ type: 'interact', objectId: obj.id })
  else if (g.underBoss(t) && g.boss.hp > 0) g.click({ type: 'attack' })
  else g.click({ type: 'walk', tile: t })
  version.value++
  if (!started.value) {
    started.value = true
    lastTickAt = performance.now()
    schedule()
  }
}

function togglePause() {
  if (!started.value || game.value.finished) return
  paused.value = !paused.value
  if (paused.value) stopLoop()
  else {
    lastTickAt = performance.now()
    schedule()
  }
}

function stepOnce() {
  if (game.value.finished) return
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

const view = computed(() => {
  void version.value
  const g = game.value
  const shots = g.stats.shots
  const last = shots[shots.length - 1]
  return {
    tick: g.tick,
    hp: g.boss.hp,
    maxHp: g.boss.maxHp,
    shots: shots.length,
    hits: g.stats.hitsTaken,
    damage: g.stats.damageTaken,
    gaps: g.shotGaps().slice(-12),
    streak: g.perfectStreak(),
    sinceShot: last === undefined ? null : g.tick - last,
    weaponReady: g.player.attackCooldown === 0,
    bossCd: g.boss.attackCooldown,
    pending: g.pendingClick,
    finished: g.finished,
    log: g.log.slice(-60).reverse(),
  }
})

/** Metronome: which beat of the 4-tick weapon cycle this tick is, counted from your last shot. */
const beat = computed(() => {
  const s = view.value.sinceShot
  if (s === null) return -1
  return s % scenario.value.playerAttackSpeed
})

watch(scenarioId, reset)
watch(running, () => {
  if (!started.value) reset()
})
watch(speed, () => {
  if (started.value && !paused.value && !game.value.finished) schedule()
})

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'SELECT') return
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
      <p class="sub">Tick-accurate kiting practice · 600 ms ticks</p>
    </header>

    <div class="layout">
      <main class="stage">
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

        <GameCanvas
          :game="game"
          :progress="progress"
          :show-grid="showGrid"
          :show-melee="showMelee"
          :show-markers="showMarkers"
          @tile-click="onTileClick"
        />

        <div class="toggles">
          <label><input type="checkbox" v-model="showMarkers" /> Tile markers</label>
          <label><input type="checkbox" v-model="showMelee" /> Graardor melee range</label>
          <label><input type="checkbox" v-model="showGrid" /> Grid</label>
        </div>
      </main>

      <aside>
        <section class="card">
          <div class="metronome" :title="'Beat of your 4-tick weapon cycle, counted from your last shot'">
            <div v-for="i in scenario.playerAttackSpeed" :key="i" class="beat" :class="{ now: beat === i - 1, shoot: i === 1 }">
              {{ i === 1 ? 'SHOOT' : i - 1 }}
            </div>
          </div>
          <div class="numbers">
            <div><span class="label">Tick</span><span class="big">{{ view.tick }}</span></div>
            <div><span class="label">Shots</span><span class="big">{{ view.shots }}</span></div>
            <div><span class="label">4-tick streak</span><span class="big good">{{ view.streak }}</span></div>
            <div><span class="label">Hits taken</span><span class="big" :class="{ bad: view.hits > 0 }">{{ view.hits }}</span></div>
          </div>
          <div class="hp">
            <div class="hp-fill" :style="{ width: (100 * view.hp) / view.maxHp + '%' }" />
            <span>Graardor {{ view.hp }} / {{ view.maxHp }}</span>
          </div>
          <div class="gaps" v-if="view.gaps.length">
            <span class="label">Ticks between shots</span>
            <span v-for="(g, i) in view.gaps" :key="i" class="gap" :class="{ perfect: g === scenario.playerAttackSpeed }">{{ g }}</span>
          </div>
          <div v-if="view.finished" class="result" :class="view.hits === 0 ? 'good' : 'ok'">
            Graardor dead in {{ view.tick }} ticks · {{ view.hits === 0 ? 'no hits taken, clean kill!' : `${view.hits} hits taken (${view.damage} damage)` }}
          </div>
          <p v-else-if="!started" class="muted hint">Click Graardor to shoot, then red-X the altar. Clicks act on the next tick.</p>
          <p v-else-if="view.pending" class="muted hint">Click queued for next tick…</p>
        </section>

        <section class="card">
          <h2>Scenario</h2>
          <p class="desc">{{ scenario.description }}</p>
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
          <h2>Rules modelled</h2>
          <ul>
            <li>600 ms ticks. Your last click before a tick is the one processed.</li>
            <li>Graardor (5×5) is processed before you each tick, chases with NPC pathing, hits every 6 ticks from directly beside him (not corners), and steps out when you're underneath.</li>
            <li>Your bow fires every 4 ticks. Shooting stops your movement; you can't shoot from under him.</li>
            <li>Clicking the door or altar (red X) paths you toward it with the game's route finder. Run is 2 tiles a tick.</li>
            <li>The room layout and Graardor's spawn are a best guess from the wiki's tile markers.</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.stage { text-align: center; }
.app { max-width: 1320px; margin: 0 auto; padding: 16px; }
header h1 { margin: 0; font-size: 22px; color: var(--accent); }
.sub { margin: 2px 0 12px; color: var(--muted); font-size: 14px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
@media (max-width: 960px) { .layout { grid-template-columns: 1fr; } }
.toolbar { justify-content: center; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.toolbar label { display: flex; gap: 6px; align-items: center; color: var(--muted); }
button.on { border-color: var(--good); }
button:disabled { opacity: 0.5; cursor: default; }
.toggles { justify-content: center; display: flex; flex-wrap: wrap; gap: 14px; margin-top: 10px; font-size: 13px; }
.toggles label { color: var(--muted); display: flex; gap: 4px; align-items: center; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.card h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.desc { margin: 0; font-size: 13px; color: var(--text); line-height: 1.45; }
.metronome { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
.beat { text-align: center; padding: 10px 0; border-radius: 8px; background: var(--panel-2); color: var(--muted); font-weight: 700; font-size: 13px; transition: background 0.08s; }
.beat.shoot { color: var(--accent); }
.beat.now { background: #3a3220; color: var(--text); box-shadow: inset 0 0 0 2px var(--accent); }
.beat.now.shoot { background: var(--accent); color: #1b1408; }
.numbers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.numbers div { background: var(--panel-2); border-radius: 6px; padding: 6px; text-align: center; }
.label { display: block; font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.big { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.big.good { color: var(--good); }
.big.bad { color: var(--bad); }
.hp { position: relative; margin-top: 10px; height: 22px; background: #5a1a15; border-radius: 6px; overflow: hidden; }
.hp-fill { position: absolute; inset: 0 auto 0 0; background: #2f8f3e; transition: width 0.2s; }
.hp span { position: relative; display: block; text-align: center; font-size: 12px; line-height: 22px; font-weight: 600; }
.gaps { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.gaps .label { width: 100%; }
.gap { min-width: 22px; text-align: center; border-radius: 4px; padding: 1px 4px; background: rgba(229,83,75,0.2); color: var(--bad); font-variant-numeric: tabular-nums; font-size: 13px; }
.gap.perfect { background: rgba(92,196,106,0.18); color: var(--good); }
.result { margin-top: 10px; padding: 8px 10px; border-radius: 6px; font-weight: 600; }
.result.good { background: rgba(92,196,106,0.15); color: var(--good); }
.result.ok { background: rgba(240,180,41,0.15); color: var(--accent); }
.hint { margin: 10px 0 0; font-size: 13px; }
.muted { color: var(--muted); }
.log { list-style: none; padding: 0; margin: 0; max-height: 220px; overflow-y: auto; font-size: 12.5px; font-family: ui-monospace, monospace; }
.log li { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.log .t { display: inline-block; width: 34px; color: var(--muted); }
.log .hit { color: var(--bad); }
.log .shot { color: var(--good); }
.log .interact, .log .done { color: var(--info); }
.help ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--muted); }
.help li { margin: 4px 0; }
</style>
