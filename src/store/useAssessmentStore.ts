import { create } from 'zustand'
import { STEPS, type StatusKey } from '@/data/tor'

type Validation = 'ok' | 'flag'

interface AssessmentState {
  step: number // -1 idle, 0..n-1 running, n done
  running: boolean
  kb: boolean[]
  filter: 'all' | StatusKey
  query: string
  selId: string | null
  valid: Record<string, Validation>
  run: () => void
  reset: () => void
  toggleKb: (i: number) => void
  setFilter: (f: 'all' | StatusKey) => void
  setQuery: (q: string) => void
  select: (id: string) => void
  validate: (v: Validation) => void
}

let timer: ReturnType<typeof setInterval> | undefined

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  step: -1,
  running: false,
  kb: [true, true, true, false],
  filter: 'all',
  query: '',
  selId: 'R-007',
  valid: {},
  run: () => {
    clearInterval(timer)
    set({ running: true, step: 0 })
    timer = setInterval(() => {
      const next = get().step + 1
      if (next >= STEPS.length) {
        clearInterval(timer)
        set({ step: STEPS.length, running: false })
      } else set({ step: next })
    }, 700)
  },
  reset: () => {
    clearInterval(timer)
    set({ step: -1, running: false })
  },
  toggleKb: (i) => set((s) => ({ kb: s.kb.map((v, j) => (j === i ? !v : v)) })),
  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  select: (selId) => set({ selId }),
  validate: (v) => {
    const { selId, valid } = get()
    if (selId) set({ valid: { ...valid, [selId]: v } })
  },
}))
