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
  showTrueTile: boolean
  route: Tile[]
}>()

const emit = defineEmits<{ tileClick: [tile: Tile] }>()

const TILE = 30
const canvas = ref<HTMLCanvasElement | null>(null)
const hover = ref<Tile | null>(null)
let raf = 0
let clickFx: { tile: Tile; at: number; red: boolean } | null = null

const COLORS = {
  floor: '#5b5340',
  floorAlt: '#575039',
  room: '#4e4a3b',
  roomAlt: '#4a4637',
  wall: '#2a2620',
  wallTop: '#3a342a',
  pillar: '#35302a',
  void: '#0d0c0a',
  door: '#8a5a2b',
  altar: '#8f8f9a',
}

function tileFromEvent(e: MouseEvent): Tile | null {
  const c = canvas.value
  if (!c) return null
  const rect = c.getBoundingClientRect()
  const sx = c.width / rect.width
  const sy = c.height / rect.height
  const x = Math.floor(((e.clientX - rect.left) * sx) / TILE)
  const y = Math.floor(((e.clientY - rect.top) * sy) / TILE)
  return props.game.map.inBounds(x, y) ? { x, y } : null
}

function onMouseMove(e: MouseEvent) {
  hover.value = tileFromEvent(e)
}

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const t = tileFromEvent(e)
  if (!t) return
  clickFx = { tile: t, at: performance.now(), red: !!props.game.map.objectAt(t.x, t.y) }
  emit('tileClick', t)
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
  ctx.clearRect(0, 0, c.width, c.height)

  // Tiles
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const k = map.kind(x, y)
      const px = x * TILE
      const py = y * TILE
      const checker = (x + y) % 2 === 0
      if (k === 'floor') {
        const room = map.inBossRoom(x, y)
        ctx.fillStyle = room ? (checker ? COLORS.room : COLORS.roomAlt) : checker ? COLORS.floor : COLORS.floorAlt
      } else if (k === 'wall') ctx.fillStyle = COLORS.wall
      else if (k === 'pillar') ctx.fillStyle = COLORS.pillar
      else if (k === 'door') ctx.fillStyle = COLORS.door
      else if (k === 'altar') ctx.fillStyle = checker ? COLORS.floor : COLORS.floorAlt
      else ctx.fillStyle = COLORS.void
      ctx.fillRect(px, py, TILE, TILE)

      if (k === 'wall') {
        ctx.fillStyle = COLORS.wallTop
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 8)
      }
      if (k === 'door') {
        ctx.fillStyle = '#5e3c1b'
        ctx.fillRect(px + 4, py + 2, TILE - 8, TILE - 4)
        ctx.fillStyle = '#d9b26a'
        ctx.beginPath()
        ctx.arc(px + TILE - 9, py + TILE / 2, 2, 0, Math.PI * 2)
        ctx.fill()
      }
      if (k === 'altar') {
        ctx.fillStyle = COLORS.altar
        ctx.fillRect(px + 3, py + 8, TILE - 6, TILE - 11)
        ctx.fillStyle = '#c7c7d4'
        ctx.fillRect(px + 2, py + 6, TILE - 4, 4)
        ctx.fillStyle = '#c98a3a'
        ctx.fillRect(px + TILE / 2 - 2, py + 1, 4, 6)
      }
      if (props.showGrid && (k === 'floor' || k === 'altar')) {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1)
      }
    }
  }

  // Optimal route overlay
  for (const t of props.route) {
    ctx.fillStyle = 'rgba(88,166,255,0.22)'
    ctx.fillRect(t.x * TILE + 4, t.y * TILE + 4, TILE - 8, TILE - 8)
  }

  // Boss
  const b = g.boss
  if (b) {
    if (b.alive && props.showMelee) {
      ctx.fillStyle = 'rgba(229,83,75,0.18)'
      for (let y = b.y - 1; y <= b.y + b.size; y++) {
        for (let x = b.x - 1; x <= b.x + b.size; x++) {
          if (map.walkable(x, y) && bossInMelee(b, { x, y })) ctx.fillRect(x * TILE, y * TILE, TILE, TILE)
        }
      }
    }
    const bx = b.x * TILE
    const by = b.y * TILE
    const size = b.size * TILE
    if (b.alive) {
      ctx.fillStyle = 'rgba(70,96,58,0.9)'
      ctx.fillRect(bx + 2, by + 2, size - 4, size - 4)
      ctx.strokeStyle = '#a7d18f'
      ctx.lineWidth = 2
      ctx.strokeRect(bx + 1, by + 1, size - 2, size - 2)
      ctx.lineWidth = 1
      ctx.fillStyle = '#e9e1cf'
      ctx.font = 'bold 13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('BOSS', bx + size / 2, by + size / 2 - 4)
      ctx.font = '11px system-ui'
      ctx.fillText(b.attackCooldown > 0 ? `attack in ${b.attackCooldown}` : 'ready', bx + size / 2, by + size / 2 + 12)
    } else {
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = 'rgba(167,209,143,0.6)'
      ctx.strokeRect(bx + 1, by + 1, size - 2, size - 2)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(233,225,207,0.8)'
      ctx.font = 'bold 13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(`respawn ${b.respawnIn}`, bx + size / 2, by + size / 2 + 4)
    }
  }

  // Trail
  g.trail.forEach((t, i) => {
    ctx.fillStyle = `rgba(240,180,41,${(0.05 + (i / g.trail.length) * 0.15).toFixed(3)})`
    ctx.fillRect(t.x * TILE + 9, t.y * TILE + 9, TILE - 18, TILE - 18)
  })

  // Destination flag
  const dest = g.player.destination
  if (dest) {
    const fx = dest.x * TILE
    const fy = dest.y * TILE
    ctx.strokeStyle = '#f0b429'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(fx + 9, fy + TILE - 4)
    ctx.lineTo(fx + 9, fy + 4)
    ctx.stroke()
    ctx.fillStyle = '#f0b429'
    ctx.beginPath()
    ctx.moveTo(fx + 10, fy + 4)
    ctx.lineTo(fx + 22, fy + 8)
    ctx.lineTo(fx + 10, fy + 13)
    ctx.fill()
    ctx.lineWidth = 1
  }

  // Player: smooth position plus true tile
  const p = g.player
  const t = Math.min(1, props.progress())
  const ix = p.prev.x + (p.pos.x - p.prev.x) * t
  const iy = p.prev.y + (p.pos.y - p.prev.y) * t
  // Door passes are instant, don't slide through the wall.
  const jumped = Math.abs(p.pos.x - p.prev.x) > 2 || Math.abs(p.pos.y - p.prev.y) > 2
  const dx = jumped ? p.pos.x : ix
  const dy = jumped ? p.pos.y : iy
  if (props.showTrueTile) {
    ctx.strokeStyle = '#58a6ff'
    ctx.lineWidth = 2
    ctx.strokeRect(p.pos.x * TILE + 1, p.pos.y * TILE + 1, TILE - 2, TILE - 2)
    ctx.lineWidth = 1
  }
  ctx.fillStyle = '#e9e1cf'
  ctx.beginPath()
  ctx.arc(dx * TILE + TILE / 2, dy * TILE + TILE / 2, TILE / 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#1b1408'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.lineWidth = 1

  // Hover
  if (hover.value) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.strokeRect(hover.value.x * TILE + 0.5, hover.value.y * TILE + 0.5, TILE - 1, TILE - 1)
  }

  // Click cross
  if (clickFx) {
    const age = (performance.now() - clickFx.at) / 400
    if (age >= 1) clickFx = null
    else {
      const cx = clickFx.tile.x * TILE + TILE / 2
      const cy = clickFx.tile.y * TILE + TILE / 2
      const r = 4 + age * 5
      ctx.strokeStyle = clickFx.red ? '#e5534b' : '#f5d547'
      ctx.globalAlpha = 1 - age
      ctx.lineWidth = 2.5
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
}

function loop() {
  draw()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

defineExpose({ hover })
</script>

<template>
  <div class="canvas-wrap">
    <canvas
      ref="canvas"
      @mousemove="onMouseMove"
      @mouseleave="hover = null"
      @mousedown="onMouseDown"
      @contextmenu.prevent
    />
    <div class="hover-info" v-if="hover">
      ({{ hover.x }}, {{ hover.y }})
      <span v-if="game.map.objectAt(hover.x, hover.y)"> · {{ game.map.objectAt(hover.x, hover.y)!.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrap { position: relative; }
canvas {
  display: block; width: 100%; height: auto; max-width: 900px;
  border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
  image-rendering: pixelated;
}
.hover-info {
  position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.65);
  padding: 2px 8px; border-radius: 4px; font-size: 12px; pointer-events: none;
}
</style>
