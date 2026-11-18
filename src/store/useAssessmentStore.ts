import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STEPS } from '@/data/tor'
import type { FunctionCoverage, RawReq, Req, StatusKey } from '@/lib/types'

type Validation = 'ok' | 'flag'
const BATCH = 10
const PARALLEL = 3

interface AssessmentState {
  step: number // -1 idle, 0..n-1 running, n done
  running: boolean
  error: string | null
  file: File | null
  customer: string
  accessCode: string
  result: Req[] | null // null until a TOR has been assessed
  coverage: FunctionCoverage[] | null
  filter: 'all' | StatusKey
  query: string
  selId: string | null
  valid: Record<string, Validation>
  setFile: (f: File | null) => void
  setCustomer: (c: string) => void
  setAccessCode: (c: string) => void
  runReal: () => Promise<void>
  reset: () => void
  setFilter: (f: 'all' | StatusKey) => void
  setQuery: (q: string) => void
  select: (id: string) => void
  validate: (v: Validation) => void
}

async function api<T>(path: string, code: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, method: 'POST', headers: { ...init.headers, 'x-access-code': code } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set, get) => ({
      step: -1,
      running: false,
      error: null,
      file: null,
      customer: '',
      accessCode: '',
      result: null,
      coverage: null,
      filter: 'all',
      query: '',
      selId: null,
      valid: {},
      setFile: (file) => set({ file, error: null }),
      setCustomer: (customer) => set({ customer }),
      setAccessCode: (accessCode) => set({ accessCode }),
      runReal: async () => {
        const { file, accessCode } = get()
        if (!file) return
        set({ running: true, step: 0, error: null })
        try {
          const { requirements } = await api<{ requirements: RawReq[] }>('/api/extract', accessCode, {
            body: file,
            headers: { 'x-filename': encodeURIComponent(file.name) },
          })
          if (requirements.length === 0) throw new Error('No requirements found in this document')
          set({ step: 2 }) // Extract + Classify done
          const batches: RawReq[][] = []
          for (let i = 0; i < requirements.length; i += BATCH) batches.push(requirements.slice(i, i + BATCH))
          // Independent of judging, so it runs alongside; a failure here must not lose the results.
          const coverageP = api<{ topics: FunctionCoverage[] }>('/api/questions', accessCode, {
            body: JSON.stringify({ requirements }),
            headers: { 'content-type': 'application/json' },
          }).then((r) => r.topics, (e: unknown) => (e instanceof Error ? e : new Error('Open-question check failed')))
          const out: Req[][] = []
          let next = 0
          let done = 0
          await Promise.all(
            Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => {
              while (next < batches.length) {
                const i = next++
                const { results } = await api<{ results: Req[] }>('/api/judge', accessCode, {
                  body: JSON.stringify({ requirements: batches[i] }),
                  headers: { 'content-type': 'application/json' },
                })
                out[i] = results
                set({ step: 2 + Math.min(2, Math.floor((++done / batches.length) * 3)) })
              }
            }),
          )
          const result = out.flat()
          const coverage = await coverageP
          set({ result, coverage: Array.isArray(coverage) ? coverage : null, error: Array.isArray(coverage) ? null : `ประเมินสำเร็จ แต่สร้างคำถามค้างไม่ได้: ${coverage.message}`, selId: result[0]?.id ?? null, valid: {}, filter: 'all', query: '', step: STEPS.length, running: false })
        } catch (e) {
          set({ running: false, step: -1, error: e instanceof Error ? e.message : 'Assessment failed' })
        }
      },
      reset: () => set({ step: -1, running: false, error: null }),
      setFilter: (filter) => set({ filter }),
      setQuery: (query) => set({ query }),
      select: (selId) => set({ selId }),
      validate: (v) => {
        const { selId, valid } = get()
        if (selId) set({ valid: { ...valid, [selId]: v } })
      },
    }),
    // Keep the result and PM validation across refresh; the access code is never persisted.
    {
      name: 'tor-scouter',
      partialize: (s) => ({ result: s.result, coverage: s.coverage, valid: s.valid, selId: s.selId, customer: s.customer }),
    },
  ),
)

