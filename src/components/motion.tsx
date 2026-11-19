import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { animate, inView, motion, useReducedMotion } from 'motion/react'

/** motion.dev's own curve: fast out, long settle. Every entrance in the app uses it. */
export const ease = [0.16, 1, 0.3, 1] as const

/** Fades up when it scrolls into view, once. `delay` staggers siblings. */
export function Reveal({ children, className, delay = 0, y = 16 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

/** A bar that grows from its left edge when it scrolls into view. The width stays in the markup, so print and tests see the real value. */
export function Grow({ className, style, delay = 0 }: { className?: string; style: CSSProperties; delay?: number }) {
  return (
    <motion.span
      className={`block origin-left ${className ?? ''}`}
      style={style}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease, delay }}
    />
  )
}

/** Counts up from 0 when it scrolls into view. The final number is always the rendered text; the count only borrows the text node. */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const node = ref.current?.firstChild
    if (!node || reduced || typeof IntersectionObserver === 'undefined') return
    node.nodeValue = '0'
    let run: ReturnType<typeof animate> | undefined
    const stop = inView(ref.current!, () => {
      run = animate(0, value, { duration: 1, ease, onUpdate: (v) => { node.nodeValue = String(Math.round(v)) } })
    }, { amount: 0.6 })
    return () => { stop(); run?.stop(); node.nodeValue = String(value) }
  }, [value, reduced])
  return <span ref={ref}>{value}</span>
}

/** Circular progress. One or more arcs share a circle (a donut); each draws itself clockwise when it scrolls into view.
 *  `value` is a 0-100 share, so the arcs add up to at most 100. Decorative: put the numbers in text next to it. */
export function Ring({ arcs, size = 160, stroke = 14, children }: { arcs: { value: number; color: string }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const r = 50 - stroke / 2 // viewBox is 100 wide, so stroke is in the same units
  const gap = arcs.filter((a) => a.value > 0).length > 1 ? 1 : 0 // a hairline between neighbours; none for a single arc
  let start = 0
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        {arcs.map((a, i) => {
          const at = start
          start += a.value
          const len = Math.max(0, a.value - gap)
          if (a.value <= 0) return null
          return (
            <motion.circle
              key={i}
              cx="50" cy="50" r={r} fill="none" stroke={a.color} strokeWidth={stroke}
              pathLength={100}
              strokeDashoffset={-at}
              initial={{ strokeDasharray: '0 100' }}
              whileInView={{ strokeDasharray: `${len} ${100 - len}` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease, delay: i * 0.08 }}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
