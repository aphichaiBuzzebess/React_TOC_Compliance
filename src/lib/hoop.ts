/**
 * Physics of the "basketball" file drop, front view. World: x sideways, h height, z depth (0 = the player, 500 = the rim).
 * A shot is simulated up front into frames, so the outcome is known before the animation plays (and is testable).
 * Ported from the Buzzebees design prototype "Basketball File Upload" (Front view).
 */
export const COURT = { w: 628, h: 380 }
const F = 700, CAMH = 330, HY = 60, CX = 314
export const BALL_R = 28
const RIM = { h: 280, z: 500, r: 60 }
const BOARD = { z: 575, half: 110, lo: 250, hi: 420 }
const G = 1500
export const MAXPULL = 140
export const DT = 1 / 120
const MAX_FRAMES = 540 // 4.5 s of flight: anything longer counts as a miss

export interface Ball { x: number; h: number; z: number; vx: number; vh: number; vz: number; falling: boolean; rot: number }
export interface Shot { p: number; vx: number; vh: number; vz: number }
export interface Flight { frames: Ball[]; result: 'score' | 'miss'; scoreAt: number | null }

export const START: Ball = { x: 0, h: 40, z: 0, vx: 0, vh: 0, vz: 0, falling: false, rot: 0 }

/** World point -> court pixel, with k the size of things at that depth. */
export function proj(x: number, h: number, z: number) {
  const k = F / (F + z)
  return { x: CX + x * k, y: HY + (CAMH - h) * k, k }
}

/** Pulling the ball back (dy down, dx sideways) is the shot: further = more power, sideways = aim. */
export function shotFromPull(dx: number, dy: number): Shot {
  const p = Math.max(0, Math.min(1, dy / MAXPULL))
  return { p, vx: -dx, vh: 700 + 500 * p, vz: 380 + 520 * p }
}

/** What "Shoot for me" throws: straight at the hoop. */
export const SURE_SHOT: Shot = { p: 0.6, vx: 0, vh: 900, vz: 625 }

function step(b: Ball, dt: number): { b: Ball; ev: 'score' | 'landed' | 'miss' | null } {
  let vx = b.vx, vh = b.vh - G * dt, vz = b.vz, falling = b.falling, ev: 'score' | 'landed' | 'miss' | null = null
  const x = b.x + vx * dt
  let h = b.h + vh * dt
  let z = b.z + vz * dt
  if (!falling) {
    if (vz > 0 && z + BALL_R >= BOARD.z && b.z + BALL_R < BOARD.z && Math.abs(x) < BOARD.half && h > BOARD.lo - BALL_R && h < BOARD.hi + BALL_R) { z = BOARD.z - BALL_R; vz = -vz * 0.5 }
    if (vh < 0 && b.h >= RIM.h && h < RIM.h) {
      const dx = x, dz = z - RIM.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001
      if (d < RIM.r - BALL_R * 0.7) { falling = true; vx *= 0.2; vz = 0; ev = 'score' }
      else if (d < RIM.r + BALL_R) {
        const sign = d < RIM.r ? -1 : 1
        vh = Math.abs(vh) * 0.45; h = RIM.h + 1
        vx += sign * (dx / d) * 160; vz += sign * (dz / d) * 160
      }
    }
  }
  if (h <= BALL_R) {
    h = BALL_R
    if (falling) { vx = 0; vz = 0; ev = 'landed' }
    else if (Math.abs(vh) > 300) { vh = -vh * 0.45; vx *= 0.7; vz *= 0.7 }
    else ev = 'miss'
  }
  if (!ev && (z > 1400 || z < -150 || Math.abs(x) > 700)) ev = 'miss'
  return { b: { x, h, z, vx, vh, vz, falling, rot: b.rot - vz * dt * 0.6 }, ev }
}

/** The whole flight of a shot: one frame per DT until it lands in the hoop (score) or is lost (miss). */
export function fly(s: Shot): Flight {
  let b: Ball = { ...START, vx: s.vx, vh: s.vh, vz: s.vz }
  const frames: Ball[] = []
  let scoreAt: number | null = null
  for (let i = 0; i < MAX_FRAMES; i++) {
    const r = step(b, DT)
    const wasFalling = b.falling
    b = r.b
    frames.push(b)
    if (!wasFalling && b.falling && scoreAt === null) scoreAt = frames.length - 1
    if (r.ev === 'landed') return { frames, result: 'score', scoreAt }
    if (r.ev === 'miss') return { frames, result: 'miss', scoreAt }
  }
  return { frames, result: 'miss', scoreAt }
}

/** Dotted path shown while aiming: every 6th frame up to the hoop (or to where the shot ends), at most 40 points. */
export function preview(s: Shot): { pts: { x: number; h: number; z: number }[]; onTarget: boolean } {
  const f = fly(s)
  const end = f.scoreAt ?? f.frames.length - 1
  const pts: { x: number; h: number; z: number }[] = []
  for (let i = 5; i <= end && pts.length < 40; i += 6) pts.push(f.frames[i])
  return { pts, onTarget: f.scoreAt !== null }
}
