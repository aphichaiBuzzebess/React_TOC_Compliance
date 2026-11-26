import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Mark } from '@/components/Brand'

const HOLD = 2000 // ms on screen before it fades
const FADE = 500

/**
 * The landing animation: on every full page load (open or refresh) the mark rises in (the mark alone, no name),
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas"
    >
      <div className="hive pointer-events-none absolute inset-x-0 top-0 h-full opacity-70" />
      <Mark size={88} className="rise-in relative" />
    </div>
  )
}
