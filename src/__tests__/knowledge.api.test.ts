// @vitest-environment node
import { memoryDb, setDb, type Db } from '../../server/db'
import { clearKnowledgeCache, loadKnowledge, validateTaxonomy, makePath } from '../../server/knowledge'
import { DEFAULT_PROMPTS } from '../../server/prompts'
import { DEFAULT_TAXONOMY } from '../../src/data/taxonomy'
import * as authApi from '../../api/auth'
import * as kbApi from '../../api/knowledge'

const CSRF = { 'x-requested-with': 'tor-scouter' }
type Handler = (r: Request) => Promise<Response>
const call = (fn: Handler, method: string, path: string, o: { body?: unknown; cookie?: string } = {}) =>
  fn(new Request(`http://localhost${path}`, { method, headers: { ...CSRF, ...(o.cookie ? { cookie: o.cookie } : {}) }, body: o.body === undefined ? undefined : JSON.stringify(o.body) }))
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]
const json = async (r: Response) => r.json() as Promise<Record<string, any>> // eslint-disable-line @typescript-eslint/no-explicit-any
const PW = 'correct horse battery'

let db: Db
let admin: string
let user: string
async function signUp(name: string) {
  const r = await call(authApi.POST, 'POST', '/api/auth?action=signup', { body: { username: name, password: PW, code: 'team' } })
  return cookieOf(r)
}
beforeEach(async () => {
  db = memoryDb()
  setDb(db)
  clearKnowledgeCache()
  process.env.ACCESS_CODE = 'team'
  admin = await signUp('ann')
  user = await signUp('bob')
  await db.setAdmin((await db.userByName('ann'))!.id, true)
})
afterEach(() => { setDb(null); delete process.env.ACCESS_CODE; clearKnowledgeCache() })

const get = (part: string, cookie = admin) => call(kbApi.GET, 'GET', `/api/knowledge?part=${part}`, { cookie })
const seed = () => call(kbApi.POST, 'POST', '/api/knowledge?part=import', { cookie: admin, body: {} })
const note = (extra: object = {}) => ({ title: 'AD login', module: '', service: 'ad-b2c', solutions: ['crm-plus'], support: 'config', body: 'รองรับ AD login ผ่าน AD B2C', ...extra })

describe('who may do what', () => {
  it('lets any signed-in person read, and nobody else write', async () => {
    expect((await get('notes', user)).status).toBe(200)
    expect((await get('taxonomy', user)).status).toBe(200)
    expect((await get('prompts', user)).status).toBe(200)
    for (const [fn, method, path] of [
      [kbApi.POST, 'POST', '/api/knowledge?part=notes'],
      [kbApi.PUT, 'PUT', '/api/knowledge?part=prompts&key=judge'],
      [kbApi.PUT, 'PUT', '/api/knowledge?part=taxonomy'],
      [kbApi.DELETE, 'DELETE', '/api/knowledge?part=notes&path=a.md&updatedAt=x'],
      [kbApi.POST, 'POST', '/api/knowledge?part=import'],
      [kbApi.POST, 'POST', '/api/knowledge?part=restore'],
    ] as const) expect((await call(fn as Handler, method, path, { cookie: user, body: {} })).status).toBe(403)
    expect((await call(kbApi.GET, 'GET', '/api/knowledge?part=versions&kind=prompt&key=judge', { cookie: user })).status).toBe(403)
    expect((await call(kbApi.GET, 'GET', '/api/knowledge?part=notes')).status).toBe(401)
  })

  it('refuses every write when accounts are off', async () => {
    setDb(null)
    delete process.env.ACCESS_CODE
    expect((await call(kbApi.GET, 'GET', '/api/knowledge?part=notes')).status).toBe(200) // read-only view of the files
    expect((await call(kbApi.PUT, 'PUT', '/api/knowledge?part=prompts&key=judge', { body: { body: 'x', updatedAt: null } })).status).toBe(403)
  })
})

describe('defaults and seeding', () => {
  it('runs on files and built-in text until the store is seeded, and says so', async () => {
    const v = await json(await get('notes'))
    expect(v.status).toBe('defaults')
    expect(v.notes).toHaveLength(30)
    expect((await loadKnowledge()).status).toBe('defaults')
    expect(await json(await seed())).toEqual({ added: 30, skipped: 0 })
    clearKnowledgeCache()
    const k = await loadKnowledge()
    expect(k.status).toBe('database')
    expect(k.notes).toHaveLength(30)
    expect(k.prompts.judge).toBe(DEFAULT_PROMPTS.judge)
    expect(await json(await seed())).toEqual({ added: 0, skipped: 30 }) // again: adds nothing
  })

  it('falls back to defaults instead of failing when the database cannot be read', async () => {
    const broken = { ...db, getMeta: async () => { throw new Error('connection lost') } } as Db
    setDb(broken)
    clearKnowledgeCache()
    const k = await loadKnowledge()
    expect(k.status).toBe('defaults')
    expect(k.notes.length).toBeGreaterThan(0)
  })

  it('does not bring a deleted note back when importing again', async () => {
    await seed()
    const list = (await json(await get('notes'))).notes as { path: string; updatedAt: string }[]
    const gone = list[0]
    expect((await call(kbApi.DELETE, 'DELETE', `/api/knowledge?part=notes&path=${encodeURIComponent(gone.path)}&updatedAt=${encodeURIComponent(gone.updatedAt)}`, { cookie: admin })).status).toBe(200)
    expect(await json(await seed())).toEqual({ added: 0, skipped: 30 })
    expect((await json(await get('notes'))).notes).toHaveLength(29)
  })
})

describe('notes', () => {
  beforeEach(async () => { await seed() })

  it('creates, edits with the token, and rejects a stale edit', async () => {
    const made = await json(await call(kbApi.POST, 'POST', '/api/knowledge?part=notes', { cookie: admin, body: note() }))
    expect(made.path).toBe('ad-b2c/ad-login.md')
    const edit = await call(kbApi.PUT, 'PUT', '/api/knowledge?part=notes', { cookie: admin, body: { ...note({ body: 'v2' }), path: made.path, updatedAt: made.updatedAt } })
    expect(edit.status).toBe(200)
    const stale = await call(kbApi.PUT, 'PUT', '/api/knowledge?part=notes', { cookie: admin, body: { ...note({ body: 'v3' }), path: made.path, updatedAt: made.updatedAt } })
    expect(stale.status).toBe(409)
    expect((await json(stale)).error).toContain('โหลดใหม่')
    const notes = (await json(await get('notes'))).notes as { path: string; body: string; module: string }[]
    expect(notes.find((n) => n.path === made.path)).toMatchObject({ body: 'v2', module: 'AD B2C Wrapper' }) // module defaults to the service label
  })

  it('validates service, solutions, support and size', async () => {
    for (const bad of [note({ service: 'nope' }), note({ solutions: ['mars'] }), note({ support: 'maybe' }), note({ title: '' }), note({ body: 'x'.repeat(20_001) }), note({ title: 'x'.repeat(121) })]) {
      expect((await call(kbApi.POST, 'POST', '/api/knowledge?part=notes', { cookie: admin, body: bad })).status).toBe(400)
    }
    expect((await call(kbApi.POST, 'POST', '/api/knowledge?part=notes', { cookie: admin, body: note({ service: null, solutions: [] }) })).status).toBe(200) // service is optional
  })

  it('gives every note its own path, even for Thai titles and repeats', async () => {
    const a = await json(await call(kbApi.POST, 'POST', '/api/knowledge?part=notes', { cookie: admin, body: note({ title: 'การล็อกอิน' }) }))
    const b = await json(await call(kbApi.POST, 'POST', '/api/knowledge?part=notes', { cookie: admin, body: note({ title: 'การล็อกอิน' }) }))
    expect(a.path).toMatch(/^ad-b2c\/note-[0-9a-f]{8}\.md$/)
    expect(b.path).not.toBe(a.path)
    expect(makePath({ ...note(), title: 'Same', module: 'M', service: null, solutions: [], support: 'full' } as never, new Set(['m/same.md']))).toBe('m/same-2.md')
  })

  it('delete keeps the text; it can be listed and restored, but only by an admin', async () => {
    const made = await json(await call(kbApi.POST, 'POST', '/api/knowledge?part=notes', { cookie: admin, body: note() }))
    expect((await call(kbApi.DELETE, 'DELETE', `/api/knowledge?part=notes&path=${encodeURIComponent(made.path)}&updatedAt=stale`, { cookie: admin })).status).toBe(409)
    expect((await call(kbApi.DELETE, 'DELETE', `/api/knowledge?part=notes&path=${encodeURIComponent(made.path)}&updatedAt=${encodeURIComponent(made.updatedAt)}`, { cookie: admin })).status).toBe(200)
    const deleted = (await json(await call(kbApi.GET, 'GET', '/api/knowledge?part=versions&kind=note&deleted=1', { cookie: admin }))).deleted as { key: string }[]
    expect(deleted.map((d) => d.key)).toEqual([made.path])
    const versions = (await json(await call(kbApi.GET, 'GET', `/api/knowledge?part=versions&kind=note&key=${encodeURIComponent(made.path)}`, { cookie: admin }))).versions as { id: number }[]
    const back = await call(kbApi.POST, 'POST', '/api/knowledge?part=restore', { cookie: admin, body: { id: versions[0].id, updatedAt: null } })
    expect(back.status).toBe(200)
    expect(((await json(await get('notes'))).notes as { path: string }[]).some((n) => n.path === made.path)).toBe(true)
  })
})

describe('taxonomy', () => {
  beforeEach(async () => { await seed() })
  const loaded = async () => { const t = await json(await get('taxonomy')); return { tx: t.taxonomy as typeof DEFAULT_TAXONOMY, at: t.updatedAt as string | null } }
  const put = (tx: unknown, at: string | null) => call(kbApi.PUT, 'PUT', '/api/knowledge?part=taxonomy', { cookie: admin, body: { taxonomy: tx, updatedAt: at } })

  it('adds a service, archives one, and shows both in the next load', async () => {
    const { tx, at } = await loaded()
    const next = { solutions: tx.solutions, services: [...tx.services.map((s) => (s.id === 'apim' ? { ...s, archived: true } : s)), { id: 'billing', label: 'Billing', hint: 'invoices', examples: ['ออกใบแจ้งหนี้'], confirmed: false }] }
    expect((await put(next, at)).status).toBe(200)
    const after = (await loaded()).tx
    expect(after.services.find((s) => s.id === 'billing')?.examples).toEqual(['ออกใบแจ้งหนี้'])
    expect(after.services.find((s) => s.id === 'apim')?.archived).toBe(true)
    clearKnowledgeCache()
    expect((await loadKnowledge()).taxonomy.services.some((s) => s.id === 'billing')).toBe(true)
  })

  it('never lets an id disappear, and keeps "unknown" and bad ids out', async () => {
    const { tx, at } = await loaded()
    const noApim = { solutions: tx.solutions, services: tx.services.filter((s) => s.id !== 'apim') }
    const r = await put(noApim, at)
    expect(r.status).toBe(400)
    expect((await json(r)).error).toContain('archive')
    for (const id of ['unknown', 'A', 'x', 'has space']) {
      expect((await put({ solutions: tx.solutions, services: [...tx.services, { id, label: 'L', hint: '', confirmed: true }] }, at)).status).toBe(400)
    }
    expect((await put({ solutions: tx.solutions, services: [...tx.services, { ...tx.services[0] }] }, at)).status).toBe(400) // duplicate id
  })

  it('enforces the limits', async () => {
    const { tx, at } = await loaded()
    const extra = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `svc-${i}`, label: 'L', hint: '', confirmed: true }))
    expect((await put({ solutions: tx.solutions, services: [...tx.services, ...extra(60)] }, at)).status).toBe(400)
    expect((await put({ solutions: tx.solutions, services: [...tx.services, { id: 'big', label: 'L', hint: 'h'.repeat(401), confirmed: true }] }, at)).status).toBe(400)
    expect((await put({ solutions: tx.solutions, services: [...tx.services, { id: 'ex', label: 'L', hint: '', examples: Array(11).fill('e'), confirmed: true }] }, at)).status).toBe(400)
    expect(() => validateTaxonomy({ solutions: Array.from({ length: 13 }, (_, i) => ({ id: `z-${i}`, label: 'L' })), services: [] }, DEFAULT_TAXONOMY)).toThrow()
  })

  it('answers 409 to a stale save, and a restore brings back ids that are newer than the version', async () => {
    const first = await loaded()
    const added = { solutions: first.tx.solutions, services: [...first.tx.services, { id: 'billing', label: 'Billing', hint: '', confirmed: true }] }
    expect((await put(added, first.at)).status).toBe(200)
    expect((await put(added, first.at)).status).toBe(409) // second admin still holds the first token
    const now = await loaded()
    expect((await put({ solutions: now.tx.solutions, services: now.tx.services.map((s) => ({ ...s, hint: 'edited' })) }, now.at)).status).toBe(200)
    const versions = (await json(await call(kbApi.GET, 'GET', '/api/knowledge?part=versions&kind=taxonomy&key=taxonomy', { cookie: admin }))).versions as { id: number; data: { services: { id: string }[] } }[]
    const oldest = versions[versions.length - 1] // the first save: it still has no "billing"... the oldest stored one is the one before it
    const cur = await loaded()
    const r = await call(kbApi.POST, 'POST', '/api/knowledge?part=restore', { cookie: admin, body: { id: oldest.id, updatedAt: cur.at } })
    expect(r.status).toBe(200)
    const restored = (await loaded()).tx
    expect(restored.services.some((s) => s.id === 'billing')).toBe(true) // never lost
  })
})

describe('prompts', () => {
  beforeEach(async () => { await seed() })
  it('saves, reads back, resets to the built-in text, and keeps versions for admins', async () => {
    const before = (await json(await get('prompts'))).prompts.judge
    expect(before).toMatchObject({ isDefault: true, body: DEFAULT_PROMPTS.judge, updatedAt: null })
    const saved = await json(await call(kbApi.PUT, 'PUT', '/api/knowledge?part=prompts&key=judge', { cookie: admin, body: { body: 'my judge prompt', updatedAt: null } }))
    expect((await loadKnowledge()).prompts.judge).toBe('my judge prompt') // the save cleared this instance's cache
    const after = (await json(await get('prompts', user))).prompts.judge // a normal user sees it, read-only
    expect(after).toMatchObject({ isDefault: false, body: 'my judge prompt', defaultBody: DEFAULT_PROMPTS.judge })
    const second = await json(await call(kbApi.PUT, 'PUT', '/api/knowledge?part=prompts&key=judge', { cookie: admin, body: { body: 'v2', updatedAt: saved.updatedAt } }))
    expect((await call(kbApi.DELETE, 'DELETE', `/api/knowledge?part=prompts&key=judge&updatedAt=${encodeURIComponent(saved.updatedAt)}`, { cookie: admin })).status).toBe(409)
    expect((await call(kbApi.DELETE, 'DELETE', `/api/knowledge?part=prompts&key=judge&updatedAt=${encodeURIComponent(second.updatedAt)}`, { cookie: admin })).status).toBe(200)
    expect((await loadKnowledge()).prompts.judge).toBe(DEFAULT_PROMPTS.judge)
    const versions = (await json(await call(kbApi.GET, 'GET', '/api/knowledge?part=versions&kind=prompt&key=judge', { cookie: admin }))).versions as { data: { body: string } }[]
    expect(versions.map((v) => v.data.body)).toEqual(['v2', 'my judge prompt'])
  })

  it('refuses an empty, a huge or an unknown prompt', async () => {
    const put = (key: string, body: unknown) => call(kbApi.PUT, 'PUT', `/api/knowledge?part=prompts&key=${key}`, { cookie: admin, body: { body, updatedAt: null } })
    expect((await put('judge', '   ')).status).toBe(400)
    expect((await put('judge', 'x'.repeat(20_001))).status).toBe(400)
    expect((await put('nope', 'text')).status).toBe(400)
    expect((await put('judge', 42)).status).toBe(400)
  })

  it('caches what runs use for a short time, while the page always reads the database', async () => {
    await call(kbApi.PUT, 'PUT', '/api/knowledge?part=prompts&key=extract', { cookie: admin, body: { body: 'first', updatedAt: null } })
    expect((await loadKnowledge()).prompts.extract).toBe('first')
    // a change made behind this instance's back (another function instance)
    await db.kbPut('prompt', 'extract', { body: 'second' }, 'other', (await db.kbGet('prompt', 'extract'))!.updatedAt)
    expect((await loadKnowledge()).prompts.extract).toBe('first') // cached
    expect((await json(await get('prompts'))).prompts.extract.body).toBe('second') // the editor sees the truth
  })
})

describe('data saved before "zone" was renamed "solution"', () => {
  it('reads an old taxonomy, an old note and an old classify prompt with the new names', async () => {
    await seed()
    const tok = (await db.kbGet('taxonomy', 'taxonomy'))?.updatedAt ?? null
    const { solutions, services } = DEFAULT_TAXONOMY
    await db.kbPut('taxonomy', 'taxonomy', { zones: solutions, services }, 'old', tok) // the old key
    await db.kbPut('note', 'old/ad-login.md', { title: 'AD login', module: '', service: 'ad-b2c', zones: ['crm-plus'], support: 'config', body: 'x' }, 'old', null)
    await db.kbPut('prompt', 'classify', { body: 'Pick one.\n{{zones}}\n{{services}}' }, 'old', (await db.kbGet('prompt', 'classify'))?.updatedAt ?? null)
    clearKnowledgeCache()
    const k = await loadKnowledge()
    expect(k.taxonomy.solutions.map((s) => s.id)).toEqual(solutions.map((s) => s.id))
    expect(k.notes.find((n) => n.path === 'old/ad-login.md')?.solution).toEqual(['crm-plus'])
    const view = await json(await get('notes'))
    expect(view.notes.find((n: { path: string }) => n.path === 'old/ad-login.md').solutions).toEqual(['crm-plus'])
    const { buildSystem } = await import('../../server/prompts')
    const sys = buildSystem('classify', k.prompts.classify, k.taxonomy)
    expect(sys).not.toContain('{{zones}}')
    expect(sys).toContain('crm-plus: CRM+ module') // the list went where {{zones}} was
  })
})
