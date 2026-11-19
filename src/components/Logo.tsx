import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'

/* Two honeycomb cells on a rising diagonal; where they overlap is see-through (even-odd). The logo is drawn from one number,
   `k`, the distance between the cells: 1 is the logo at rest (same shape as public/brand/*.svg), more is further apart.
   Every motion below is just animating k. */
const R = 72.9
const HALF = [(0.997 * R) / 2, (-0.961 * R) / 2] as const // half of the offset between the two cell centres, at rest
const CENTRE = 128
const CORNER = 6

const cell = (cx: number, cy: number) => [-90, -30, 30, 90, 150, 210].map((a) => [cx + R * Math.cos((a * Math.PI) / 180), cy + R * Math.sin((a * Math.PI) / 180)] as const)

type P = readonly [number, number]
const toward = (a: P, b: P, t: number): P => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const k = Math.min(t, len * 0.45) / len
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}
const f = (n: number) => n.toFixed(2)

/** A polygon with softly rounded corners. */
function rounded(pts: readonly P[]): string {
  const n = pts.length
  const corners = pts.map((p, i) => ({ s: toward(p, pts[(i + n - 1) % n], CORNER), c: p, e: toward(p, pts[(i + 1) % n], CORNER) }))
  let d = `M${f(corners[0].s[0])} ${f(corners[0].s[1])}`
  corners.forEach(({ s, c, e }, i) => {
    if (i > 0) d += ` L${f(s[0])} ${f(s[1])}`
    d += ` Q${f(c[0])} ${f(c[1])} ${f(e[0])} ${f(e[1])}`
  })
  return `${d} Z`
}

/** The logo's path at spread `k` (1 = at rest). */
export const logoPath = (k: number) => `${rounded(cell(CENTRE - HALF[0] * k, CENTRE - HALF[1] * k))} ${rounded(cell(CENTRE + HALF[0] * k, CENTRE + HALF[1] * k))}`

/** How far apart the cells sit for a given progress, where 1 = matched (at rest). */
export const spreadFor = (progress: number) => 1 + (1 - Math.min(1, Math.max(0, progress))) * 1.15

/**
 * The animated mark. Three behaviours:
 * - `intro`: the cells fly in from far apart and settle, once when it first appears.
 * - `active`: the cells part a little, e.g. while the logo is hovered.
 * - `progress` (0 to 1): the cells close in as the work gets done; at 1 they overlap and the window opens.
 * Decorative: put the product name next to it. With reduced motion the cells jump instead of travelling.
 */
export function Logo({ size = 40, progress, intro = false, active = false, className }: { size?: number; progress?: number; intro?: boolean; active?: boolean; className?: string }) {
  const target = progress !== undefined ? spreadFor(progress) : active ? 1.3 : 1
  const k = useMotionValue(intro ? 2.4 : target)
  const d = useTransform(k, logoPath)
  const reduced = useReducedMotion()
  const first = useRef(true)
  useEffect(() => {
    const entering = intro && first.current
    first.current = false
    const run = animate(k, target, reduced ? { duration: 0 } : { type: 'spring', stiffness: entering ? 90 : 220, damping: entering ? 11 : 22, delay: entering ? 0.15 : 0 })
    return () => run.stop()
  }, [target, reduced, k, intro])
  return (
    <motion.svg aria-hidden="true" width={size} height={size} viewBox="0 0 256 256" style={{ overflow: 'visible' }} className={className} initial={intro ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <motion.path d={d} fill="#f9a601" fillRule="evenodd" />
    </motion.svg>
  )
}
