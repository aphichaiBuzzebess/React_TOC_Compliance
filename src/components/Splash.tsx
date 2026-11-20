import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Logo } from '@/components/Logo'
import { ease } from '@/components/motion'

const HOLD = 2000 // ms on screen before it fades
const FADE = 500

/**
 * The landing animation: on every full page load (open or refresh) the logo's two cells fly in and settle, the name rises under it,
 * then the screen fades to the app. Any click or key skips it. Skipped entirely with reduced motion. Decorative: it hides from screen readers.
 */
export default function Splash() {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in')

  useEffect(() => {
    if (phase !== 'in') return
    const skip = () => setPhase('out')
    const t = window.setTimeout(skip, HOLD)
    window.addEventListener('keydown', skip)
    return () => { clearTimeout(t); window.removeEventListener('keydown', skip) }
  }, [phase])
  useEffect(() => {
    if (phase !== 'out') return
    const t = window.setTimeout(() => setPhase('gone'), FADE)
    return () => clearTimeout(t)
  }, [phase])

  if (reduced || phase === 'gone') return null
  return (
    <div
      aria-hidden
      data-testid="splash"
      onPointerDown={() => setPhase('out')}
      style={{ opacity: phase === 'out' ? 0 : 1, transition: `opacity ${FADE}ms cubic-bezier(0.16,1,0.3,1)`, pointerEvents: phase === 'out' ? 'none' : 'auto' }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-canvas"
    >
      <div className="hive pointer-events-none absolute inset-x-0 top-0 h-full opacity-70" />
      <Logo size={120} intro />
      <motion.div className="relative flex flex-col items-center gap-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.7 }}>
        <span className="text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink">TOR Scouter</span>
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Compliance workspace</span>
      </motion.div>
    </div>
  )
}
