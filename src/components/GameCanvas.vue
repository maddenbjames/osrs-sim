<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Game } from '../engine/game'
import { bossInMelee } from '../engine/game'
import type { Tile } from '../engine/types'

const props = defineProps<{
  game: Game
  /** 0..1 progress through the current tick, used to animate movement. */
  progress: () => number
  showGrid: boolean
  showMelee: boolean
  showMarkers: boolean
}>()

const emit = defineEmits<{ tileClick: [tile: Tile] }>()

const TILE = 36
const canvas = ref<HTMLCanvasElement | null>(null)
const hover = ref<Tile | null>(null)
let raf = 0
let clickFx: { tile: Tile; at: number; red: boolean } | null = null

// Deterministic per-tile noise so the stone floor doesn't shimmer.
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function tileFromEvent(e: MouseEvent): Tile | null {
  const c = canvas.value
  if (!c) return null
  const rect = c.getBoundingClientRect()
  const x = Math.floor(((e.clientX - rect.left) * (c.width / rect.width)) / TILE)
  const y = Math.floor(((e.clientY - rect.top) * (c.height / rect.height)) / TILE)
  return props.game.map.inBounds(x, y) ? { x, y } : null
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const t = tileFromEvent(e)
  if (!t) return
  const g = props.game
  clickFx = { tile: t, at: performance.now(), red: !!g.map.objectAt(t.x, t.y) || g.underBoss(t) }
  emit('tileClick', t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function draw() {
  const c = canvas.value
  const g = props.game
  if (!c) return
  const ctx = c.getContext('2d')!
  const { map } = g
  if (c.width !== map.width * TILE) {
    c.width = map.width * TILE
    c.height = map.height * TILE
  }
  const T = TILE
  ctx.fillStyle = '#0b0a08'
  ctx.fillRect(0, 0, c.width, c.height)

  // ---- floor & walls
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const k = map.kind(x, y)
      const px = x * T
      const py = y * T
      const n = hash(x, y)
      if (k === 'floor' || k === 'altar' || k === 'door') {
        const room = map.inBossRoom(x, y)
        const base = room ? 62 + n * 14 : 70 + n * 12
        ctx.fillStyle = `rgb(${base + 6}, ${base - 2}, ${base - 16})`
        ctx.fillRect(px, py, T, T)
        // flagstone seams
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        if (n > 0.5) ctx.fillRect(px + T / 2, py, 1, T)
        else ctx.fillRect(px, py + T / 2, T, 1)
        ctx.fillStyle = 'rgba(255,240,210,0.04)'
        ctx.fillRect(px + 2, py + 2, T - 4, 2)
      }
      if (k === 'wall') {
        ctx.fillStyle = '#1c1915'
        ctx.fillRect(px, py, T, T)
        ctx.fillStyle = `rgb(${48 + n * 10}, ${43 + n * 8}, ${36 + n * 6})`
        ctx.fillRect(px + 1, py + 1, T - 2, T - 6)
        ctx.fillStyle = 'rgba(255,255,255,0.05)'
        ctx.fillRect(px + 1, py + 1, T - 2, 3)
      }
      if (props.showGrid && (k === 'floor' || k === 'altar')) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1)
      }
    }
  }

  // ---- objects
  for (const o of map.objects) {
    const px = o.x * T
    const py = o.y * T
    if (o.kind === 'door') {
      ctx.fillStyle = '#3b2412'
      ctx.fillRect(px - 4, py, T + 8, T)
      ctx.fillStyle = '#7a4a22'
      ctx.fillRect(px + 2, py + 3, T - 4, T - 6)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      for (let i = 1; i < 4; i++) ctx.fillRect(px + 2 + (i * (T - 4)) / 4, py + 3, 1, T - 6)
      ctx.fillStyle = '#9a9a9a'
      ctx.fillRect(px + 2, py + 8, T - 4, 3)
      ctx.fillRect(px + 2, py + T - 11, T - 4, 3)
    } else {
      ctx.fillStyle = '#5a5650'
      ctx.fillRect(px + 3, py + 8, T - 6, T - 10)
      ctx.fillStyle = '#7d786f'
      ctx.fillRect(px + 1, py + 5, T - 2, 6)
      ctx.fillStyle = '#c0392b'
      ctx.fillRect(px + 6, py + 11, T - 12, 4)
      ctx.fillStyle = '#f39c12'
      ctx.beginPath()
      ctx.ellipse(px + T / 2, py + 4, 3, 5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ---- tile markers (A / D / Shoot-*)
  if (props.showMarkers) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const m of g.scenario.markers) {
      const col = m.color === 'red' ? '255,70,70' : '40,255,90'
      ctx.fillStyle = `rgba(${col},0.16)`
      ctx.fillRect(m.x * T, m.y * T, T, T)
      ctx.strokeStyle = `rgba(${col},0.95)`
      ctx.lineWidth = 2
      ctx.strokeRect(m.x * T + 1, m.y * T + 1, T - 2, T - 2)
      ctx.lineWidth = 1
      ctx.fillStyle = `rgb(${col})`
      const short = m.label.length > 2
      ctx.font = short ? 'bold 9px system-ui' : 'bold 15px system-ui'
      if (short) {
        const [a, b] = m.label.split('-')
        ctx.fillText(a, m.x * T + T / 2, m.y * T + T / 2 - 6)
        ctx.fillText(b, m.x * T + T / 2, m.y * T + T / 2 + 6)
      } else ctx.fillText(m.label, m.x * T + T / 2, m.y * T + T / 2)
    }
  }

  const t = Math.min(1, props.progress())
  const b = g.boss

  // ---- Graardor's melee range
  if (b.hp > 0 && props.showMelee) {
    ctx.fillStyle = 'rgba(229,83,75,0.13)'
    for (let y = b.y - 1; y <= b.y + b.size; y++)
      for (let x = b.x - 1; x <= b.x + b.size; x++)
        if (map.walkable(x, y) && bossInMelee(b, { x, y })) ctx.fillRect(x * T, y * T, T, T)
  }

  // ---- trail
  g.trail.forEach((tt, i) => {
    ctx.fillStyle = `rgba(240,180,41,${(0.04 + (i / g.trail.length) * 0.14).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(tt.x * T + T / 2, tt.y * T + T / 2, 4, 0, Math.PI * 2)
    ctx.fill()
  })

  // ---- Graardor
  if (b.hp > 0) {
    const bx = lerp(b.prevX, b.x, t) * T
    const by = lerp(b.prevY, b.y, t) * T
    const S = b.size * T
    // true tile footprint
    ctx.strokeStyle = 'rgba(255,200,80,0.8)'
    ctx.setLineDash([6, 4])
    ctx.strokeRect(b.x * T + 1, b.y * T + 1, S - 2, S - 2)
    ctx.setLineDash([])
    // body
    const cx = bx + S / 2
    const cy = by + S / 2
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(cx, cy + S * 0.3, S * 0.38, S * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
    const grad = ctx.createRadialGradient(cx - S * 0.1, cy - S * 0.15, S * 0.05, cx, cy, S * 0.42)
    grad.addColorStop(0, '#8fa36a')
    grad.addColorStop(1, '#3f4f2b')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(cx, cy, S * 0.36, S * 0.33, 0, 0, Math.PI * 2)
    ctx.fill()
    // armour plates
    ctx.fillStyle = '#6b5a3a'
    ctx.fillRect(cx - S * 0.22, cy - S * 0.05, S * 0.44, S * 0.16)
    ctx.fillStyle = '#2a2a2a'
    ctx.beginPath()
    ctx.arc(cx - S * 0.1, cy - S * 0.14, 4, 0, Math.PI * 2)
    ctx.arc(cx + S * 0.1, cy - S * 0.14, 4, 0, Math.PI * 2)
    ctx.fill()
    // HP bar
    const w = S * 0.6
    ctx.fillStyle = '#a3241c'
    ctx.fillRect(cx - w / 2, by - 4, w, 6)
    ctx.fillStyle = '#2fbf4a'
    ctx.fillRect(cx - w / 2, by - 4, (w * b.hp) / b.maxHp, 6)
    // attack timer ring
    ctx.strokeStyle = b.attackCooldown === 0 ? '#e5534b' : 'rgba(233,225,207,0.6)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy + S * 0.18, 9, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (b.attackSpeed - b.attackCooldown)) / b.attackSpeed)
    ctx.stroke()
    ctx.lineWidth = 1
  }

  // ---- destination flag
  const dest = g.player.destination
  if (dest) {
    const fx = dest.x * T
    const fy = dest.y * T
    ctx.strokeStyle = '#d9c9a0'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(fx + 11, fy + T - 5)
    ctx.lineTo(fx + 11, fy + 5)
    ctx.stroke()
    ctx.fillStyle = '#e5534b'
    ctx.beginPath()
    ctx.moveTo(fx + 12, fy + 5)
    ctx.lineTo(fx + 26, fy + 10)
    ctx.lineTo(fx + 12, fy + 15)
    ctx.fill()
    ctx.lineWidth = 1
  }

  // ---- player
  const p = g.player
  const jumped = Math.abs(p.pos.x - p.prev.x) > 2 || Math.abs(p.pos.y - p.prev.y) > 2
  const px = (jumped ? p.pos.x : lerp(p.prev.x, p.pos.x, t)) * T + T / 2
  const py = (jumped ? p.pos.y : lerp(p.prev.y, p.pos.y, t)) * T + T / 2
  ctx.strokeStyle = '#3ab0ff'
  ctx.lineWidth = 2
  ctx.strokeRect(p.pos.x * T + 1, p.pos.y * T + 1, T - 2, T - 2)
  ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(px, py + 9, 9, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2e5e8c'
  ctx.fillRect(px - 6, py - 4, 12, 13)
  ctx.fillStyle = '#e8c8a0'
  ctx.beginPath()
  ctx.arc(px, py - 8, 5, 0, Math.PI * 2)
  ctx.fill()
  if (g.stats.shots[g.stats.shots.length - 1] === g.tick) {
    // arrow flying toward Graardor
    const tx = (b.x + b.size / 2) * T
    const ty = (b.y + b.size / 2) * T
    ctx.strokeStyle = '#f5e6b8'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(lerp(px, tx, t), lerp(py, ty, t))
    ctx.lineTo(lerp(px, tx, Math.min(1, t + 0.15)), lerp(py, ty, Math.min(1, t + 0.15)))
    ctx.stroke()
    ctx.lineWidth = 1
  }

  // ---- hitsplats
  for (const s of g.splats) {
    const sx = s.on === 'boss' ? (b.x + b.size / 2) * T : p.pos.x * T + T / 2
    const sy = s.on === 'boss' ? (b.y + b.size / 2) * T : p.pos.y * T + T / 2 - 6
    ctx.fillStyle = s.amount === 0 ? '#2d6cdf' : '#c0281e'
    ctx.beginPath()
    ctx.arc(sx, sy, 11, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 12px system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(s.amount), sx, sy + 1)
  }

  // ---- hover
  if (hover.value) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.strokeRect(hover.value.x * T + 0.5, hover.value.y * T + 0.5, T - 1, T - 1)
  }

  // ---- click cross
  if (clickFx) {
    const age = (performance.now() - clickFx.at) / 400
    if (age >= 1) clickFx = null
    else {
      const cx = clickFx.tile.x * T + T / 2
      const cy = clickFx.tile.y * T + T / 2
      const r = 5 + age * 5
      ctx.strokeStyle = clickFx.red ? '#ff3b30' : '#ffe14d'
      ctx.globalAlpha = 1 - age
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx - r, cy - r)
      ctx.lineTo(cx + r, cy + r)
      ctx.moveTo(cx + r, cy - r)
      ctx.lineTo(cx - r, cy + r)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.lineWidth = 1
    }
  }

  // ---- vignette
  const vg = ctx.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.3, c.width / 2, c.height / 2, c.height * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, c.width, c.height)
}

function loop() {
  draw()
  raf = requestAnimationFrame(loop)
}
onMounted(() => (raf = requestAnimationFrame(loop)))
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="canvas-wrap">
    <canvas
      ref="canvas"
      @mousemove="hover = tileFromEvent($event)"
      @mouseleave="hover = null"
      @mousedown="onMouseDown"
      @contextmenu.prevent
    />
    <div class="hover-info" v-if="hover">
      ({{ hover.x }}, {{ hover.y }})
      <template v-if="game.map.objectAt(hover.x, hover.y)"> · {{ game.map.objectAt(hover.x, hover.y)!.label }}</template>
      <template v-else-if="game.underBoss(hover)"> · Attack Graardor</template>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrap { position: relative; display: inline-block; max-width: 100%; }
canvas {
  display: block; max-width: 100%; max-height: calc(100vh - 150px); width: auto; height: auto;
  border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
}
.hover-info {
  position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7);
  padding: 2px 8px; border-radius: 4px; font-size: 12px; pointer-events: none;
}
</style>
