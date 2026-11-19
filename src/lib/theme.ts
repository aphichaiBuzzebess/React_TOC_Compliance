import { useEffect, useState } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'

const dark = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

/** The theme in force: the user's pick, or the device's setting while they have not picked. */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useAssessmentStore((s) => s.theme)
  const [system, setSystem] = useState(() => !!dark()?.matches)
  useEffect(() => {
    const q = dark()
    if (!q) return
    const on = () => setSystem(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return theme === 'system' ? (system ? 'dark' : 'light') : theme
}
