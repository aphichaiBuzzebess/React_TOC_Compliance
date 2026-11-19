import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STEPS } from '@/data/tor'
import { defaultModel, type ProviderId } from '@/data/models'
import type { FunctionCoverage, RawReq, Req, StatusKey } from '@/lib/types'

type Validation = 'ok' | 'flag'
const BATCH = 10
const PARALLEL = 3
const COVERAGE_PARTS = 4 // the topic check is split in this many short calls: one long call timed out (504) on big TORs
const MAX_FILE = 4 * 1024 * 1024 // matches the server limit
const MAX_FILES = 10
const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

interface AssessmentState {
  step: number // -1 idle, 0..n-1 running, n done
  running: boolean
  startedAt: number | null
  detail: string // what the run is doing right now
  error: string | null
  files: File[]
  customer: string
  accessCode: string // optional, only if the operator set one
  provider: ProviderId
  model: string
  apiKey: string // memory only: never persisted
  serverDefault: { provider: ProviderId; model: string } | null // the operator's AI, if the server offers one (no key here)
  loadServerDefault: () => Promise<void>
  result: Req[] | null // null until a TOR has been assessed
  coverage: FunctionCoverage[] | null
  filter: 'all' | StatusKey
  query: string
  selId: string | null
  valid: Record<string, Validation>
  addFiles: (list: File[]) => void
  removeFile: (i: number) => void
  setCustomer: (c: string) => void
  setAccessCode: (c: string) => void
  setProvider: (p: ProviderId) => void
  setModel: (m: string) => void
  setApiKey: (k: string) => void
  runReal: () => Promise<void>
  coverageBusy: boolean
  runCoverage: () => Promise<void>
  reset: () => void
  setFilter: (f: 'all' | StatusKey) => void
  setQuery: (q: string) => void
  select: (id: string) => void
  validate: (v: Validation) => void
}

type Auth = Pick<AssessmentState, 'accessCode' | 'provider' | 'model' | 'apiKey'>

/** Headers for one request. The AI key goes to our API only to be used for that call; the server stores nothing. */
export function authHeaders({ accessCode, provider, model, apiKey }: Auth): Record<string, string> {
  const code: Record<string, string> = accessCode ? { 'x-access-code': accessCode } : {}
  // No key of your own: send nothing about the AI, and the server uses its default.
  return apiKey ? { 'x-llm-provider': provider, 'x-llm-model': model, 'x-llm-key': apiKey, ...code } : code
}

/** Ready to run: you typed a key, or the server has a default AI. */
export const hasAi = (s: Pick<AssessmentState, 'apiKey' | 'serverDefault'>) => !!s.apiKey || !!s.serverDefault
/** Which AI a run will use right now, for display. */
export const activeAi = (s: Pick<AssessmentState, 'apiKey' | 'serverDefault' | 'provider' | 'model'>) => (s.apiKey ? { provider: s.provider, model: s.model, own: true } : s.serverDefault ? { ...s.serverDefault, own: false } : null)

async function api<T>(path: string, auth: Auth, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, method: 'POST', headers: { ...init.headers, ...authHeaders(auth) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

/** The open-question check, as COVERAGE_PARTS parallel calls over slices of the topic list, joined in order. */
async function fetchCoverage(auth: Auth, requirements: RawReq[]): Promise<FunctionCoverage[]> {
  const parts = await Promise.all(
    Array.from({ length: COVERAGE_PARTS }, (_, part) =>
      api<{ topics: FunctionCoverage[] }>('/api/questions', auth, { body: JSON.stringify({ requirements, part, of: COVERAGE_PARTS }), headers: { 'content-type': 'application/json' } }),
    ),
  )
  return parts.flatMap((p) => p.topics)
}

export const useAssessmentStore = create<AssessmentState>()(
  persist(
    (set, get) => ({
      step: -1,
      running: false,
      startedAt: null,
      detail: '',
      coverageBusy: false,
      error: null,
      files: [],
      customer: '',
      accessCode: '',
      provider: 'anthropic',
      model: defaultModel('anthropic'),
      apiKey: '',
      serverDefault: null,
      loadServerDefault: async () => {
        try {
          const res = await fetch('/api/status', { headers: authHeaders({ ...get(), apiKey: '' }) })
          const body = res.ok ? await res.json() : null
          set({ serverDefault: body?.default ?? null })
        } catch {
          set({ serverDefault: null })
        }
      },
      result: null,
      coverage: null,
      filter: 'all',
      query: '',
      selId: null,
      valid: {},
      addFiles: (list) => {
        const seen = new Set(get().files.map(fileKey))
        const fresh = list.filter((f) => !seen.has(fileKey(f)))
        const big = fresh.find((f) => f.size > MAX_FILE)
        const room = MAX_FILES - get().files.length
        const ok = fresh.filter((f) => f.size <= MAX_FILE).slice(0, Math.max(0, room))
        const error = big ? `${big.name} ใหญ่เกิน 4 MB` : fresh.length > room ? `แนบได้ไม่เกิน ${MAX_FILES} ไฟล์` : null
        set({ files: [...get().files, ...ok], error })
      },
      removeFile: (i) => set({ files: get().files.filter((_, j) => j !== i), error: null }),
      setCustomer: (customer) => set({ customer }),
      setAccessCode: (accessCode) => set({ accessCode }),
      setProvider: (provider) => set({ provider, model: defaultModel(provider) }),
      setModel: (model) => set({ model }),
      setApiKey: (apiKey) => set({ apiKey }),
      runReal: async () => {
        const { files } = get()
        if (files.length === 0 || !hasAi(get())) return
        const auth = get()
        set({ running: true, step: 0, error: null, startedAt: Date.now(), detail: 'กำลังอ่านไฟล์และแยก requirement ด้วย AI (ใช้เวลาประมาณ 30-60 วินาที)' })
        try {
          // One request per file (a request body is capped at ~4.5 MB), a few at a time. Ids are renumbered once all are in.
          const perFile: RawReq[][] = []
          let read = 0
          let nextFile = 0
          await Promise.all(
            Array.from({ length: Math.min(PARALLEL, files.length) }, async () => {
              while (nextFile < files.length) {
                const i = nextFile++
                const f = files[i]
                try {
                  perFile[i] = (await api<{ requirements: RawReq[] }>('/api/extract', auth, { body: f, headers: { 'x-filename': encodeURIComponent(f.name) } })).requirements
                } catch (e) {
                  throw new Error(files.length > 1 ? `${f.name}: ${e instanceof Error ? e.message : 'read failed'}` : e instanceof Error ? e.message : 'read failed')
                }
                if (files.length > 1) set({ detail: `อ่านไฟล์แล้ว ${++read}/${files.length} ไฟล์` })
              }
            }),
          )
          const requirements = perFile.flat().map((r, i) => ({ ...r, id: `R-${String(i + 1).padStart(3, '0')}` }))
          if (requirements.length === 0) throw new Error('No requirements found in these files')
          set({ step: 2, detail: `พบ ${requirements.length} requirement กำลังเทียบกับ KB (0/${Math.ceil(requirements.length / BATCH)} ชุด)` }) // Extract + Classify done
          const batches: RawReq[][] = []
          for (let i = 0; i < requirements.length; i += BATCH) batches.push(requirements.slice(i, i + BATCH))
          // Independent of judging, so it runs alongside; a failure here must not lose the results.
          const coverageP = fetchCoverage(auth, requirements).then((t) => t, (e: unknown) => (e instanceof Error ? e : new Error('Open-question check failed')))
          const out: Req[][] = []
          let next = 0
          let done = 0
          await Promise.all(
            Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => {
              while (next < batches.length) {
                const i = next++
                const { results } = await api<{ results: Req[] }>('/api/judge', auth, {
                  body: JSON.stringify({ requirements: batches[i] }),
                  headers: { 'content-type': 'application/json' },
                })
                out[i] = results
                set({ step: 2 + Math.min(2, Math.floor((++done / batches.length) * 3)), detail: `พบ ${requirements.length} requirement ประเมินแล้ว ${done}/${batches.length} ชุด` })
              }
            }),
          )
          const result = out.flat()
          const coverage = await coverageP
          set({ result, coverage: Array.isArray(coverage) ? coverage : null, error: Array.isArray(coverage) ? null : `ประเมินสำเร็จ แต่สร้างคำถามค้างไม่ได้: ${coverage.message}`, selId: result[0]?.id ?? null, valid: {}, filter: 'all', query: '', step: STEPS.length, running: false, startedAt: null, detail: '' })
        } catch (e) {
          set({ running: false, startedAt: null, detail: '', step: -1, error: e instanceof Error ? e.message : 'Assessment failed' })
        }
      },
      runCoverage: async () => {
        const { result } = get()
        if (!result || !hasAi(get())) return
        set({ coverageBusy: true, error: null })
        try {
          const requirements: RawReq[] = result.map(({ id, module, text }) => ({ id, module, text }))
          set({ coverage: await fetchCoverage(get(), requirements), coverageBusy: false })
        } catch (e) {
          set({ coverageBusy: false, error: e instanceof Error ? e.message : 'Open-question check failed' })
        }
      },
      reset: () => set({ step: -1, running: false, error: null, startedAt: null, detail: '' }),
      setFilter: (filter) => set({ filter }),
      setQuery: (query) => set({ query }),
      select: (selId) => set({ selId }),
      validate: (v) => {
        const { selId, valid } = get()
        if (selId) set({ valid: { ...valid, [selId]: v } })
      },
    }),
    // Keep the result and PM validation across refresh; the key and access code are never persisted.
    {
      name: 'tor-scouter',
      partialize: (s) => ({ result: s.result, coverage: s.coverage, valid: s.valid, selId: s.selId, customer: s.customer, provider: s.provider, model: s.model }),
    },
  ),
)

