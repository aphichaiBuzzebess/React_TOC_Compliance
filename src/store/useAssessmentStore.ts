import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STEPS } from '@/data/tor'
import { defaultModel, type ProviderId } from '@/data/models'
import type { FunctionCoverage, RawReq, Req, StatusKey, Target } from '@/lib/types'
import { DEFAULT_TAXONOMY, MAX_TARGETS, type Taxonomy } from '@/data/taxonomy'

type Validation = 'ok' | 'flag'
const BATCH = 10
const PARALLEL = 3
const COVERAGE_PARTS = 4 // the topic check is split in this many short calls: one long call timed out (504) on big TORs
const MAX_FILE = 4 * 1024 * 1024 // matches the server limit
const MAX_FILES = 10
const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

export interface StoredKey { provider: ProviderId; model: string; last4: string }
const CSRF = { 'x-requested-with': 'tor-scouter' }

interface AssessmentState {
  mode: 'unknown' | 'stateless' | 'account' // what the server said on first load; unknown until then
  user: string | null // signed-in username (account mode)
  admin: boolean // the signed-in person may manage users
  taxonomy: Taxonomy // zones and services; the built-in ones until the server sends the saved ones
  loadTaxonomy: () => Promise<void>
  owner: string | null // persisted: whose data is in this browser; null = from before accounts
  storedKey: StoredKey | null // the key saved on the server (never the key itself)
  historyId: string | null // the saved history entry of the results on screen
  historyError: string | null
  expireSession: () => void
  loadAuth: () => Promise<void>
  signIn: (username: string, password: string) => Promise<string | null> // an error message, or null on success
  signUp: (username: string, password: string, code: string) => Promise<string | null>
  signOut: () => Promise<void>
  saveKey: (key: string) => Promise<string | null>
  removeKey: () => Promise<void>
  openHistory: (id: string) => Promise<boolean>
  saveHistory: () => Promise<void> // POST the finished run (account mode)
  syncHistory: () => void // debounced PUT of validations / coverage to the saved entry
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
  theme: 'system' | 'light' | 'dark' // follows the device until the user picks one
  setTheme: (t: 'system' | 'light' | 'dark') => void
  serverDefault: { provider: ProviderId; model: string } | null // the operator's AI, if the server offers one (no key here)
  loadServerDefault: () => Promise<void>
  result: Req[] | null // null until a TOR has been assessed
  review: RawReq[] | null // classified requirements waiting for the BA to confirm zones; null when nothing is pending
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
  runReal: () => Promise<void> // extract + classify, then stops at the review
  setTargets: (id: string, targets: Target[]) => void
  setWantsApi: (id: string, flag: boolean) => void
  confirmReview: () => Promise<void> // judge the confirmed requirements
  clearReview: () => void // drop the pending review (results already judged are untouched)
  coverageBusy: boolean
  runCoverage: () => Promise<void>
  reset: () => void
  setFilter: (f: 'all' | StatusKey) => void
  setQuery: (q: string) => void
  select: (id: string) => void
  validate: (v: Validation) => void
}

type Auth = Pick<AssessmentState, 'accessCode' | 'provider' | 'model' | 'apiKey'> & Partial<Pick<AssessmentState, 'mode'>>

/** Headers for one request. The AI key goes to our API only to be used for that call; the server stores nothing. */
export function authHeaders({ accessCode, provider, model, apiKey, mode }: Auth): Record<string, string> {
  // Account mode: the session cookie is the credential, the team code is only for signing up.
  const code: Record<string, string> = mode === 'account' ? CSRF : accessCode ? { 'x-access-code': accessCode } : {}
  // No key of your own: send nothing about the AI, and the server uses its default.
  return apiKey ? { 'x-llm-provider': provider, 'x-llm-model': model, 'x-llm-key': apiKey, ...code } : code
}

/** Ready to run: you typed a key, or the server has a default AI. */
export const hasAi = (s: Pick<AssessmentState, 'apiKey' | 'serverDefault'> & Partial<Pick<AssessmentState, 'storedKey'>>) => !!s.apiKey || !!s.serverDefault || !!s.storedKey
/** Which AI a run will use right now, for display. */
export const activeAi = (s: Pick<AssessmentState, 'apiKey' | 'serverDefault' | 'provider' | 'model'> & Partial<Pick<AssessmentState, 'storedKey'>>) => (s.apiKey ? { provider: s.provider, model: s.model, own: true } : s.storedKey ? { provider: s.storedKey.provider, model: s.storedKey.model, own: true } : s.serverDefault ? { ...s.serverDefault, own: false } : null)

async function api<T>(path: string, auth: Auth, init: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, method: 'POST', headers: { ...init.headers, ...authHeaders(auth) } })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 && auth.mode === 'account') useAssessmentStore.getState().expireSession() // the session ended: nothing of it may stay on screen
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

/** What a person leaves behind on screen: wiped on sign-out, when the session ends, and when another person signs in. */
const WIPE = { result: null, review: null, coverage: null, valid: {}, selId: null, customer: '', historyId: null, historyError: null, apiKey: '', files: [] as File[], step: -1, error: null }

/** A JSON call to our own API with the CSRF header and the session cookie. */
async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { ...CSRF, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Who owns the data in this browser: unstamped data from before accounts goes to whoever signs in first; anyone else's is wiped. */
function adopt(user: string | null) {
  const { owner } = useAssessmentStore.getState()
  if (user === null) {
    if (owner !== null) useAssessmentStore.setState({ ...WIPE, owner: null })
  } else if (owner !== null && owner !== user) useAssessmentStore.setState({ ...WIPE, owner: user, storedKey: null })
  else useAssessmentStore.setState({ owner: user })
}

async function loadKey() {
  const res = await fetch('/api/key').catch(() => null)
  const body = res?.ok ? await res.json().catch(() => null) : null
  useAssessmentStore.setState({ storedKey: body?.provider ? { provider: body.provider, model: body.model, last4: body.last4 } : null })
}

function enter(username: string | undefined, admin = false): null {
  useAssessmentStore.setState({ mode: 'account', user: username ?? null, admin })
  adopt(username ?? null)
  void useAssessmentStore.getState().loadServerDefault()
  void useAssessmentStore.getState().loadTaxonomy()
  void loadKey()
  return null
}

let syncTimer: ReturnType<typeof setTimeout> | undefined

/** `fn` over BATCH-sized slices, PARALLEL at a time, joined in order. `progress` gets (done, total) after each slice. */
async function inBatches<I, O>(items: I[], fn: (batch: I[]) => Promise<O[]>, progress: (done: number, total: number) => void): Promise<O[]> {
  const batches: I[][] = []
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH))
  const out: O[][] = []
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => {
      while (next < batches.length) {
        const i = next++
        out[i] = await fn(batches[i])
        progress(++done, batches.length)
      }
    }),
  )
  return out.flat()
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
      theme: 'system',
      setTheme: (theme) => set({ theme }),
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
      mode: 'unknown',
      user: null,
      admin: false,
      taxonomy: DEFAULT_TAXONOMY,
      loadTaxonomy: async () => {
        const { mode, user } = get()
        if (mode !== 'account' || !user) return // without accounts the built-in taxonomy is the only one
        try {
          const res = await fetch('/api/knowledge?part=taxonomy')
          const body = res.ok ? await res.json() : null
          if (body?.taxonomy?.zones && body?.taxonomy?.services) set({ taxonomy: body.taxonomy })
        } catch {
          /* keep what is here */
        }
      },
      owner: null,
      storedKey: null,
      historyId: null,
      historyError: null,
      expireSession: () => set({ ...WIPE, user: null, admin: false, owner: null, storedKey: null }),
      loadAuth: async () => {
        try {
          const res = await fetch('/api/auth')
          const body = res.ok ? await res.json().catch(() => null) : null
          if (body?.mode === 'account') {
            const user: string | null = body.user?.username ?? null
            set({ mode: 'account', user, admin: body.admin === true })
            adopt(user)
            if (user) { void get().loadServerDefault(); void loadKey(); void get().loadTaxonomy() }
          } else {
            set({ mode: 'stateless', user: null, admin: false })
            if (body?.mode === 'stateless' && get().owner !== null) set({ ...WIPE, owner: null }) // accounts were switched off: data stamped to a person goes
          }
        } catch {
          set({ mode: 'stateless', user: null }) // could not reach the server: keep what is here, change nothing
        }
      },
      signIn: async (username, password) => {
        const r = await send('/api/auth?action=login', 'POST', { username, password })
        return r.ok ? enter(r.json.user?.username, r.json.admin === true) : (r.json.error ?? 'ล็อกอินไม่สำเร็จ')
      },
      signUp: async (username, password, code) => {
        const r = await send('/api/auth?action=signup', 'POST', { username, password, code })
        return r.ok ? enter(r.json.user?.username, r.json.admin === true) : (r.json.error ?? 'สมัครไม่สำเร็จ')
      },
      signOut: async () => {
        await send('/api/auth?action=logout', 'POST', {}).catch(() => null)
        set({ ...WIPE, user: null, admin: false, owner: null, storedKey: null })
      },
      saveKey: async (key) => {
        const { provider, model } = get()
        const r = await send('/api/key', 'PUT', { provider, model, key })
        if (!r.ok) return r.json.error ?? 'บันทึก key ไม่สำเร็จ'
        set({ storedKey: { provider: r.json.provider, model: r.json.model, last4: r.json.last4 }, apiKey: '' }) // the typed key leaves the page
        return null
      },
      removeKey: async () => {
        const r = await send('/api/key', 'DELETE')
        if (r.ok) set({ storedKey: null })
      },
      openHistory: async (id) => {
        const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`)
        const body = await res.json().catch(() => ({}))
        if (res.status === 401) get().expireSession()
        if (!res.ok || !body.entry) { set({ error: body.error ?? 'เปิดรายการนี้ไม่ได้' }); return false }
        const { entry } = body
        set({ result: entry.data.result, coverage: entry.data.coverage, valid: entry.data.valid, customer: entry.customer, selId: entry.data.result[0]?.id ?? null, historyId: id, review: null, step: STEPS.length, filter: 'all', query: '', error: null, historyError: null })
        return true
      },
      saveHistory: async () => {
        const s = get()
        if (s.mode !== 'account' || !s.user || !s.result) return
        const r = await send('/api/history', 'POST', { customer: s.customer, files: s.files.map((f) => f.name), data: { result: s.result, coverage: s.coverage, valid: s.valid } })
        set(r.ok ? { historyId: r.json.id, historyError: null } : { historyError: r.json.error ?? 'ไม่ได้บันทึกประวัติ' })
      },
      syncHistory: () => {
        clearTimeout(syncTimer)
        syncTimer = setTimeout(async () => {
          const s = get()
          if (s.mode !== 'account' || !s.historyId || !s.result) return
          const r = await send(`/api/history?id=${s.historyId}`, 'PUT', { data: { result: s.result, coverage: s.coverage, valid: s.valid } })
          if (r.status === 404) set({ historyId: null }) // deleted or pruned: stop updating it
          else if (!r.ok) set({ historyError: r.json.error ?? 'ไม่ได้บันทึกประวัติ' })
        }, 800)
      },
      result: null,
      review: null,
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
        set({ running: true, step: 0, error: null, historyId: null, historyError: null, startedAt: Date.now(), detail: 'กำลังอ่านไฟล์และแยก requirement ด้วย AI (ใช้เวลาประมาณ 30-60 วินาที)' })
        try {
          await get().loadTaxonomy() // the saved zones/services, in case an admin changed them
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
          set({ step: 1, detail: `พบ ${requirements.length} requirement กำลังจัดเข้า zone และ service (0/${Math.ceil(requirements.length / BATCH)} ชุด)` }) // Extract done
          const classified = await inBatches(requirements, (batch) => api<{ results: RawReq[] }>('/api/classify', auth, { body: JSON.stringify({ requirements: batch }), headers: { 'content-type': 'application/json' } }).then((r) => r.results), (done, total) =>
            set({ detail: `พบ ${requirements.length} requirement จัด zone แล้ว ${done}/${total} ชุด` }),
          )
          // Stop here: the BA confirms zones and services before anything is judged.
          set({ review: classified, result: null, coverage: null, step: 2, running: false, startedAt: null, detail: '' })
        } catch (e) {
          set({ running: false, startedAt: null, detail: '', step: -1, error: e instanceof Error ? e.message : 'Assessment failed' })
        }
      },
      // A blank target is allowed while editing; the judge endpoint drops blank/duplicate ones (cleanTargets).
      setTargets: (id, targets) => set({ review: get().review?.map((r) => (r.id === id ? { ...r, targets: targets.slice(0, MAX_TARGETS) } : r)) ?? null }),
      setWantsApi: (id, flag) => set({ review: get().review?.map((r) => (r.id === id ? { ...r, wantsApi: flag } : r)) ?? null }),
      clearReview: () => set({ review: null, step: -1, error: null }),
      confirmReview: async () => {
        const { review } = get()
        if (!review || review.length === 0 || !hasAi(get())) return
        const auth = get()
        set({ running: true, step: 2, error: null, startedAt: Date.now(), detail: `กำลังเทียบกับ KB (0/${Math.ceil(review.length / BATCH)} ชุด)` })
        try {
          // Independent of judging, so it runs alongside; a failure here must not lose the results.
          const coverageP = fetchCoverage(auth, review).then((t) => t, (e: unknown) => (e instanceof Error ? e : new Error('Open-question check failed')))
          const result = await inBatches(review, (batch) => api<{ results: Req[] }>('/api/judge', auth, { body: JSON.stringify({ requirements: batch }), headers: { 'content-type': 'application/json' } }).then((r) => r.results), (done, total) =>
            set({ step: 2 + Math.min(2, Math.floor((done / total) * 3)), detail: `ประเมินแล้ว ${done}/${total} ชุด` }),
          )
          const coverage = await coverageP
          set({ result, review: null, coverage: Array.isArray(coverage) ? coverage : null, error: Array.isArray(coverage) ? null : `ประเมินสำเร็จ แต่สร้างคำถามค้างไม่ได้: ${coverage.message}`, selId: result[0]?.id ?? null, valid: {}, filter: 'all', query: '', historyId: null, step: STEPS.length, running: false, startedAt: null, detail: '' })
          void get().saveHistory()
        } catch (e) {
          set({ running: false, startedAt: null, detail: '', step: 2, error: e instanceof Error ? e.message : 'Assessment failed' }) // the review is kept: confirm again to retry
        }
      },
      runCoverage: async () => {
        const { result } = get()
        if (!result || !hasAi(get())) return
        set({ coverageBusy: true, error: null })
        try {
          const requirements: RawReq[] = result.map(({ id, module, text }) => ({ id, module, text }))
          set({ coverage: await fetchCoverage(get(), requirements), coverageBusy: false })
          get().syncHistory()
        } catch (e) {
          set({ coverageBusy: false, error: e instanceof Error ? e.message : 'Open-question check failed' })
        }
      },
      reset: () => set({ step: -1, running: false, error: null, startedAt: null, detail: '', review: null }),
      setFilter: (filter) => set({ filter }),
      setQuery: (query) => set({ query }),
      select: (selId) => set({ selId }),
      validate: (v) => {
        const { selId, valid } = get()
        if (selId) {
          set({ valid: { ...valid, [selId]: v } })
          get().syncHistory()
        }
      },
    }),
    // Keep the result and PM validation across refresh; the key and access code are never persisted.
    {
      name: 'tor-scouter',
      partialize: (s) => ({ theme: s.theme, owner: s.owner, historyId: s.historyId, result: s.result, review: s.review, coverage: s.coverage, valid: s.valid, selId: s.selId, customer: s.customer, provider: s.provider, model: s.model }),
    },
  ),
)

