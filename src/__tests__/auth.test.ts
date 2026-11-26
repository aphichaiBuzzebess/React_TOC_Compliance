// @vitest-environment node
import { memoryDb, setDb, accountMode, type Db } from '../../server/db'
import { decryptKey, encryptKey } from '../../server/vault'
import { hashPassword, verifyPassword } from '../../server/auth'
import { llmFromRequest } from '../../server/http'
import * as authApi from '../../api/auth'
import * as keyApi from '../../api/key'
import * as historyApi from '../../api/history'
import * as statusApi from '../../api/status'
import * as scouterApi from '../../api/scouter'
import { groupGaps, runGrouping, type Evidence } from '../../server/scout'
import type { Llm } from '../../server/llm'

const CSRF = { 'x-requested-with': 'tor-scouter' }
const call = (fn: (r: Request) => Promise<Response>, method: string, path: string, o: { body?: unknown; cookie?: string; headers?: Record<string, string>; csrf?: boolean } = {}) =>
  fn(new Request(`http://localhost${path}`, { method, headers: { ...(o.csrf === false ? {} : CSRF), ...(o.cookie ? { cookie: o.cookie } : {}), ...o.headers }, body: o.body === undefined ? undefined : JSON.stringify(o.body) }))
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]
const PW = 'correct horse battery'
const SECRET = Buffer.alloc(32, 7).toString('base64')

let db: Db
beforeEach(() => {
  db = memoryDb()
  setDb(db)
  process.env.KEY_ENCRYPTION_SECRET = SECRET
  process.env.ACCESS_CODE = 'team-code'
})
afterEach(() => {
  setDb(null)
  for (const k of ['KEY_ENCRYPTION_SECRET', 'ACCESS_CODE', 'VERCEL_ENV', 'LLM_PROVIDER', 'GEMINI_API_KEY']) delete process.env[k]
})

async function signUp(username = 'ann', pw = PW, code = 'team-code') {
  const r = await call(authApi.POST, 'POST', '/api/auth?action=signup', { body: { username, password: pw, code } })
  return { r, cookie: cookieOf(r) }
}

describe('vault', () => {
  it('round-trips a key and never stores it in the clear', () => {
    const e = encryptKey('u1', 'sk-secret-key-1234')
    expect(e.ciphertext.toString('utf8')).not.toContain('sk-secret')
    expect(decryptKey('u1', e)).toBe('sk-secret-key-1234')
  })
  it('refuses another user, a changed byte, and a missing secret', () => {
    const e = encryptKey('u1', 'sk-secret-key-1234')
    expect(() => decryptKey('u2', e)).toThrow()
    e.ciphertext[0] ^= 1
    expect(() => decryptKey('u1', e)).toThrow()
    delete process.env.KEY_ENCRYPTION_SECRET
    expect(() => encryptKey('u1', 'x')).toThrow(/KEY_ENCRYPTION_SECRET/)
  })
})

describe('passwords', () => {
  it('verifies the right one and rejects the wrong one', async () => {
    const h = await hashPassword(PW)
    expect(h.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword(PW, h)).toBe(true)
    expect(await verifyPassword('wrong password!!', h)).toBe(false)
    expect(await verifyPassword(PW, 'garbage')).toBe(false)
  })
})

describe('accounts', () => {
  it('needs the CSRF header on anything but GET', async () => {
    const r = await call(authApi.POST, 'POST', '/api/auth?action=signup', { csrf: false, body: { username: 'ann', password: PW, code: 'team-code' } })
    expect(r.status).toBe(403)
  })

  it('signs up with the team code, sets a safe cookie, and knows who is signed in', async () => {
    const { r, cookie } = await signUp()
    expect(r.status).toBe(200)
    const set = r.headers.get('set-cookie')!
    expect(set).toContain('HttpOnly')
    expect(set).toContain('SameSite=Lax')
    expect(set).not.toContain('Secure') // localhost
    const me = await (await call(authApi.GET, 'GET', '/api/auth', { cookie })).json()
    expect(me).toEqual({ mode: 'account', user: { username: 'ann' }, admin: false })
    expect(await (await call(authApi.GET, 'GET', '/api/auth')).json()).toEqual({ mode: 'account', user: null, admin: false })
  })

  it('refuses a wrong team code, throttles guessing, and is disabled without a code on Vercel', async () => {
    for (let i = 0; i < 5; i++) expect((await signUp('bob', PW, 'nope')).r.status).toBe(403)
    expect((await signUp('bob', PW, 'nope')).r.status).toBe(429)
    expect((await signUp('bob', PW, 'team-code')).r.status).toBe(429) // even the right code waits out the window
    setDb(memoryDb())
    delete process.env.ACCESS_CODE
    process.env.VERCEL_ENV = 'preview'
    const r = await signUp('eve', PW, '')
    expect(r.r.status).toBe(403)
    expect(await r.r.json()).toMatchObject({ error: expect.stringContaining('รหัสทีม') })
  })

  it('rejects weak input and a taken name', async () => {
    expect((await signUp('x', PW)).r.status).toBe(400)
    expect((await signUp(`${'a'.repeat(101)}`, PW)).r.status).toBe(400)
    expect((await signUp('first.last+tag@buzzebees.com', PW)).r.status).toBe(200) // an email is a fine username, even past 40 characters
    expect((await signUp('a-very-long-first-name.and-a-long-last-name@buzzebees.com', PW)).r.status).toBe(200)
    expect((await signUp('ann', 'short')).r.status).toBe(400)
    await signUp('ann')
    expect((await signUp('ANN')).r.status).toBe(409) // names are case-insensitive
  })

  it('gives the same answer for an unknown user and a wrong password, and throttles', async () => {
    await signUp('ann')
    const a = await call(authApi.POST, 'POST', '/api/auth?action=login', { body: { username: 'ann', password: 'wrong-password-1' } })
    const b = await call(authApi.POST, 'POST', '/api/auth?action=login', { body: { username: 'nobody', password: 'wrong-password-1' } })
    expect(a.status).toBe(401)
    expect(await a.json()).toEqual(await b.json())
    for (let i = 0; i < 4; i++) await call(authApi.POST, 'POST', '/api/auth?action=login', { body: { username: 'ann', password: 'wrong-password-1' } }) // 5 wrong in all for ann
    expect((await call(authApi.POST, 'POST', '/api/auth?action=login', { body: { username: 'ann', password: PW } })).status).toBe(429)
  })

  it('logs in, logs out, and a disabled user is locked out including live sessions', async () => {
    const { cookie: first } = await signUp('ann')
    const login = await call(authApi.POST, 'POST', '/api/auth?action=login', { body: { username: 'ann', password: PW } })
    const cookie = cookieOf(login)
    expect(login.status).toBe(200)
    await call(authApi.POST, 'POST', '/api/auth?action=logout', { cookie, body: {} })
    expect((await (await call(authApi.GET, 'GET', '/api/auth', { cookie })).json()).user).toBeNull()
    const ann = (await db.userByName('ann'))!
    await db.setDisabled(ann.id, true)
    expect((await (await call(authApi.GET, 'GET', '/api/auth', { cookie: first })).json()).user).toBeNull()
    expect((await call(authApi.POST, 'POST', '/api/auth?action=login', { body: { username: 'ann', password: PW } })).status).toBe(401)
  })

  it('changing the password ends the other sessions only', async () => {
    const { cookie: a } = await signUp('ann')
    const b = cookieOf(await call(authApi.POST, 'POST', '/api/auth?action=login', { body: { username: 'ann', password: PW } }))
    const bad = await call(authApi.POST, 'POST', '/api/auth?action=password', { cookie: a, body: { current: 'wrong-password-1', password: 'brand new password' } })
    expect(bad.status).toBe(401)
    const ok = await call(authApi.POST, 'POST', '/api/auth?action=password', { cookie: a, body: { current: PW, password: 'brand new password' } })
    expect(ok.status).toBe(200)
    expect((await (await call(authApi.GET, 'GET', '/api/auth', { cookie: a })).json()).user).not.toBeNull()
    expect((await (await call(authApi.GET, 'GET', '/api/auth', { cookie: b })).json()).user).toBeNull()
  })

  it('protects the other endpoints in account mode, and leaves stateless mode alone', async () => {
    expect((await call(statusApi.GET, 'GET', '/api/status')).status).toBe(401)
    const { cookie } = await signUp('ann')
    expect((await call(statusApi.GET, 'GET', '/api/status', { cookie })).status).toBe(200)
    setDb(null)
    expect(accountMode()).toBe(false)
    expect((await call(statusApi.GET, 'GET', '/api/status', { headers: { 'x-access-code': 'team-code' } })).status).toBe(200)
    expect(await (await call(authApi.GET, 'GET', '/api/auth', { headers: { 'x-access-code': 'team-code' } })).json()).toEqual({ mode: 'stateless', user: null })
  })
})

describe('stored key', () => {
  const put = (cookie: string, key = 'sk-live-abcdefgh1234') => call(keyApi.PUT, 'PUT', '/api/key', { cookie, body: { provider: 'gemini', model: 'gemini-3.8-flash', key } })

  it('is saved encrypted, and only provider, model and last 4 ever come back', async () => {
    const { cookie } = await signUp('ann')
    const saved = await put(cookie)
    expect(await saved.json()).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash', last4: '1234' })
    const got = await call(keyApi.GET, 'GET', '/api/key', { cookie })
    expect(JSON.stringify(await got.json())).not.toContain('abcdefgh')
    const row = (await db.getKey((await db.userByName('ann'))!.id))!
    expect(row.ciphertext.toString('utf8')).not.toContain('abcdefgh')
    expect(await (await call(statusApi.GET, 'GET', '/api/status', { cookie })).json()).toMatchObject({ keySource: 'stored', last4: '1234' })
  })

  it('accepts an OpenAI key like any other, stored encrypted', async () => {
    const { cookie } = await signUp('ann')
    const r = await call(keyApi.PUT, 'PUT', '/api/key', { cookie, body: { provider: 'openai', model: 'gpt-5', key: 'sk-proj-abcdefghij1234' } })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ provider: 'openai', model: 'gpt-5', last4: '1234' })
    const base = new Request('http://localhost/api/extract', { method: 'POST', headers: { ...CSRF, cookie } })
    await expect(llmFromRequest(base)).resolves.toEqual({ provider: 'openai', apiKey: 'sk-proj-abcdefghij1234', model: 'gpt-5' })
  })

  it('is used for the run, loses to a header key, and can be removed', async () => {
    const { cookie } = await signUp('ann')
    await put(cookie)
    const base = (extra: Record<string, string> = {}) => new Request('http://localhost/api/extract', { method: 'POST', headers: { ...CSRF, cookie, ...extra } })
    await expect(llmFromRequest(base())).resolves.toEqual({ provider: 'gemini', apiKey: 'sk-live-abcdefgh1234', model: 'gemini-3.8-flash' })
    const own = { 'x-llm-provider': 'anthropic', 'x-llm-model': 'm1', 'x-llm-key': 'header-key-123456' }
    expect((await llmFromRequest(base(own))).apiKey).toBe('header-key-123456')
    await call(keyApi.DELETE, 'DELETE', '/api/key', { cookie })
    await expect(llmFromRequest(base())).rejects.toThrow(/provider/)
  })

  it('never falls back to the operator key when the stored one cannot be decrypted', async () => {
    const { cookie } = await signUp('ann')
    await put(cookie)
    process.env.LLM_PROVIDER = 'gemini'
    process.env.GEMINI_API_KEY = 'operator-key-123456'
    process.env.KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 9).toString('base64') // rotated
    await expect(llmFromRequest(new Request('http://localhost/api/extract', { method: 'POST', headers: { ...CSRF, cookie } }))).rejects.toThrow(/ใส่ API key ใหม่/)
  })

  it('belongs to its owner only', async () => {
    const { cookie: a } = await signUp('ann')
    await put(a)
    const { cookie: b } = await signUp('bob')
    expect(await (await call(keyApi.GET, 'GET', '/api/key', { cookie: b })).json()).toBeNull()
  })

  it('rejects a bad provider, model or an empty key, and needs a session', async () => {
    const { cookie } = await signUp('ann')
    expect((await call(keyApi.PUT, 'PUT', '/api/key', { cookie, body: { provider: 'gpt', model: 'm', key: 'k-12345678' } })).status).toBe(400)
    expect((await call(keyApi.PUT, 'PUT', '/api/key', { cookie, body: { provider: 'gemini', model: 'm?x=1', key: 'k-12345678' } })).status).toBe(400)
    expect((await call(keyApi.PUT, 'PUT', '/api/key', { cookie, body: { provider: 'gemini', model: 'm', key: ' ' } })).status).toBe(400)
    expect((await call(keyApi.PUT, 'PUT', '/api/key', { body: { provider: 'gemini', model: 'm', key: 'k-12345678' } })).status).toBe(401)
  })
})

describe('history', () => {
  const result = (s = 'full') => ({ id: 'R-001', module: 'Member', text: 't', s, conf: '90%', reason: 'r', evidence: 'e', rec: 'c', targets: [{ solution: 'crm-plus', service: 'point' }], wantsApi: true })
  const entry = (extra: object = {}) => ({ customer: 'ACME', files: ['tor.pdf'], data: { result: [result(), { ...result('none'), id: 'R-002' }], coverage: null, valid: { 'R-001': 'ok' } }, ...extra })
  const create = async (cookie: string, body: unknown = entry()) => (await (await call(historyApi.POST, 'POST', '/api/history', { cookie, body })).json()) as { id: string }

  it('saves, lists, reopens, updates and deletes', async () => {
    const { cookie } = await signUp('ann')
    const { id } = await create(cookie)
    const list = await (await call(historyApi.GET, 'GET', '/api/history', { cookie })).json()
    expect(list.entries).toHaveLength(1)
    expect(list.entries[0]).toMatchObject({ id, customer: 'ACME', files: ['tor.pdf'], counts: { full: 1, none: 1 } })
    expect(list.entries[0].data).toBeUndefined()
    const one = await (await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).json()
    expect(one.entry.data.result).toHaveLength(2)
    expect(one.entry.data.result[0]).toMatchObject({ wantsApi: true })
    const put = await call(historyApi.PUT, 'PUT', `/api/history?id=${id}`, { cookie, body: { data: { ...entry().data, valid: { 'R-001': 'flag', 'R-002': 'ok' } } } })
    expect(put.status).toBe(200)
    expect((await (await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).json()).entry.data.valid).toEqual({ 'R-001': 'flag', 'R-002': 'ok' })
    expect((await call(historyApi.DELETE, 'DELETE', `/api/history?id=${id}`, { cookie })).status).toBe(200)
    expect((await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).status).toBe(404)
  })

  it('keeps the project details, lists their title and due date, and refuses a bad date', async () => {
    const { cookie } = await signUp('ann')
    const meta = { title: 'TOR ระบบสมาชิก', industry: 'Retail Business', sub: 'Department Store', leaf: 'Department Store', due: '2026-12-15', value: 1800000 }
    const { id } = await create(cookie, entry({ data: { ...entry().data, meta } }))
    await create(cookie) // an entry without details still lists, with empty title and due
    const list = (await (await call(historyApi.GET, 'GET', '/api/history', { cookie })).json()).entries
    expect(list.find((e: { id: string }) => e.id === id)).toMatchObject({ title: 'TOR ระบบสมาชิก', due: '2026-12-15' })
    expect(list.find((e: { id: string }) => e.id !== id)).toMatchObject({ title: '', due: '' })
    expect((await (await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).json()).entry.data.meta).toEqual(meta)
    expect((await call(historyApi.POST, 'POST', '/api/history', { cookie, body: entry({ data: { ...entry().data, meta: { ...meta, due: '15/12/2026' } } }) })).status).toBe(400)
  })

  it('saves a TOR while it waits for its review, lists it as waiting, then takes the judged result in its place', async () => {
    const { cookie } = await signUp('ann')
    const review = [
      { id: 'R-001', module: 'Mission', text: 'ภารกิจ', pri: 'M', ref: 'ข้อ 2.9', amb: 'ไม่ชัด', inf: true, targets: [{ solution: 'crm-plus', service: 'point' }] },
      { id: 'R-002', module: 'เงื่อนไขสัญญาและผู้ยื่น', text: 'ส่งมอบ 120 วัน', pri: 'M' },
    ]
    const { id } = await create(cookie, { customer: 'ACME', files: [], data: { scope: 'ระบบสมาชิก', review } })
    const listed = (await (await call(historyApi.GET, 'GET', '/api/history', { cookie })).json()).entries[0]
    expect(listed.counts).toEqual({ review: 2 })
    const opened = (await (await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).json()).entry.data
    expect(opened).toMatchObject({ scope: 'ระบบสมาชิก', review: [{ pri: 'M', ref: 'ข้อ 2.9', amb: 'ไม่ชัด', inf: true }, { text: 'ส่งมอบ 120 วัน' }], result: [], terms: [], confirmed: null })
    // judged: the review goes, the result and the contract terms come in
    const judged = { scope: 'ระบบสมาชิก', review: null, terms: [{ id: 'R-002', text: 'ส่งมอบ 120 วัน', ok: true }], confirmed: { by: 'ann', at: '2026-11-20T09:05:00.000Z' }, result: [{ ...result(), pri: 'O', gap: 'g', q: 'q?', override: { from: 'verify', note: 'PM' } }, { ...result('none'), id: 'R-003' }], coverage: null, valid: {} }
    expect((await call(historyApi.PUT, 'PUT', `/api/history?id=${id}`, { cookie, body: { data: judged } })).status).toBe(200)
    const after = (await (await call(historyApi.GET, 'GET', '/api/history', { cookie })).json()).entries[0]
    expect(after.counts).toMatchObject({ full: 1, 'o:full': 1, none: 1, 'o:none': 0 })
    expect(after.counts.review).toBeUndefined()
    const back = (await (await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).json()).entry.data
    expect(back.result[0]).toMatchObject({ pri: 'O', gap: 'g', q: 'q?', override: { from: 'verify', note: 'PM' } })
    expect(back.terms).toEqual([{ id: 'R-002', text: 'ส่งมอบ 120 วัน', ok: true }])
    expect(back.confirmed).toEqual({ by: 'ann', at: '2026-11-20T09:05:00.000Z' })
    // an entry with neither a review nor a result is refused
    expect((await call(historyApi.POST, 'POST', '/api/history', { cookie, body: { customer: 'x', files: [], data: {} } })).status).toBe(400)
  })

  it('opens an entry saved before "zone" was renamed "solution", with the new name', async () => {
    const { cookie } = await signUp('ann')
    const uid = (await db.userByName('ann'))!.id
    const old = { ...result(), targets: [{ zone: 'crm-plus', service: 'point' }] }
    const id = await db.insertAssessment(uid, { customer: '', files: [], counts: {}, schema: 1, data: { result: [old], coverage: null, valid: {} } })
    const opened = (await (await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).json()).entry.data
    expect(opened.result[0].targets).toEqual([{ solution: 'crm-plus', service: 'point' }])
  })

  it('keeps each user to their own entries, even by id', async () => {
    const { cookie: a } = await signUp('ann')
    const { id } = await create(a)
    const { cookie: b } = await signUp('bob')
    expect((await (await call(historyApi.GET, 'GET', '/api/history', { cookie: b })).json()).entries).toEqual([])
    expect((await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie: b })).status).toBe(404)
    expect((await call(historyApi.PUT, 'PUT', `/api/history?id=${id}`, { cookie: b, body: { data: entry().data } })).status).toBe(404)
    expect((await call(historyApi.DELETE, 'DELETE', `/api/history?id=${id}`, { cookie: b })).status).toBe(404)
    expect((await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie: a })).status).toBe(200)
  })

  it('rejects a bad shape and a result that is too big, and drops unknown fields', async () => {
    const { cookie } = await signUp('ann')
    expect((await call(historyApi.POST, 'POST', '/api/history', { cookie, body: { data: { result: [{ id: 'x' }] } } })).status).toBe(400)
    expect((await call(historyApi.POST, 'POST', '/api/history', { cookie, body: 'nope' })).status).toBe(400)
    const big = entry({ data: { result: Array.from({ length: 900 }, (_, i) => ({ ...result(), id: `R-${i}`, reason: 'x'.repeat(3900), evidence: 'y'.repeat(3900), rec: 'z'.repeat(3900) })), coverage: null, valid: {} } })
    expect((await call(historyApi.POST, 'POST', '/api/history', { cookie, body: big })).status).toBe(413)
    const { id } = await create(cookie, entry({ extra: 'x', data: { ...entry().data, junk: 1 } }))
    expect(JSON.stringify((await db.getAssessment((await db.userByName('ann'))!.id, id))!.data)).not.toContain('junk')
  })

  it('keeps only the newest 50, and can still open old entries', async () => {
    const { cookie } = await signUp('ann')
    for (let i = 0; i < 52; i++) await create(cookie, entry({ customer: `c${i}` }))
    const list = (await (await call(historyApi.GET, 'GET', '/api/history', { cookie })).json()).entries
    expect(list).toHaveLength(50)
  })

  it('refuses a stored entry that no longer fits the shape instead of crashing the client', async () => {
    const { cookie } = await signUp('ann')
    const uid = (await db.userByName('ann'))!.id
    const id = await db.insertAssessment(uid, { customer: '', files: [], counts: {}, schema: 0, data: { result: 'old format' } })
    expect((await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).status).toBe(422)
    expect((await call(historyApi.DELETE, 'DELETE', `/api/history?id=${id}`, { cookie })).status).toBe(200) // can still be deleted
  })
})

describe('feature scouter: the gaps of every saved TOR', () => {
  const r = (id: string, s: string, extra: object = {}) => ({ id, module: 'Dashboard & Report', text: `text ${id}`, s, conf: '90%', reason: `why ${id}`, evidence: 'e', rec: 'c', ...extra })
  const judged = (extra: object = {}) => ({
    meta: { title: 'TOR CRM', industry: 'Retail Business', sub: 'Department Store', leaf: 'Department Store', due: '2026-12-15', value: 1800000 },
    result: [r('R-1', 'full'), r('R-2', 'none', { gap: 'ไม่มีมิติสาขา' }), r('R-3', 'custom', { pri: 'O' }), r('R-4', 'integ'), r('R-5', 'verify'), r('R-6', 'config')],
    coverage: null,
    valid: { 'R-2': 'ok', 'R-4': 'flag' },
    ...extra,
  })
  const save = async (cookie: string, data: object, customer = 'ACME') => (await (await call(historyApi.POST, 'POST', '/api/history', { cookie, body: { customer, files: [], data } })).json()) as { id: string }
  const gaps = async () => (await db.scoutEvidence()).sort((a, b) => (a.reqId < b.reqId ? -1 : 1))

  it('keeps each gap (not supported, development, integration) with its TOR details; only a confirmed one is marked so', async () => {
    const { cookie } = await signUp('ann')
    const { id } = await save(cookie, judged())
    const g = await gaps()
    expect(g.map((e) => e.reqId)).toEqual(['R-2', 'R-3', 'R-4']) // not full, config or verify
    expect(g[0]).toMatchObject({ assessmentId: id, s: 'none', gap: 'ไม่มีมิติสาขา', mandatory: true, confirmed: true, tor: 'TOR CRM', customer: 'ACME', industry: 'Retail Business › Department Store', deal: 1800000, due: '2026-12-15', itemId: null, dealResult: 'open', lostBecause: false })
    expect(g[1]).toMatchObject({ s: 'custom', mandatory: false, confirmed: false, gap: 'why R-3' }) // no gap text: the reason stands in
    expect(g[2]).toMatchObject({ s: 'integ', confirmed: false }) // flagged is not confirmed
  })

  it('follows later edits: a confirmation, a status a person changed, and a delete', async () => {
    const { cookie } = await signUp('ann')
    const { id } = await save(cookie, judged())
    const changed = judged({ result: [r('R-2', 'none'), r('R-3', 'full', { override: { from: 'custom', note: 'มีแล้ว' } }), r('R-4', 'integ')], valid: { 'R-2': 'ok', 'R-4': 'ok' } })
    expect((await call(historyApi.PUT, 'PUT', `/api/history?id=${id}`, { cookie, body: { data: changed } })).status).toBe(200)
    expect((await gaps()).map((e) => [e.reqId, e.confirmed, e.customer])).toEqual([['R-2', true, 'ACME'], ['R-4', true, 'ACME']]) // R-3 is supported now
    expect((await call(historyApi.DELETE, 'DELETE', `/api/history?id=${id}`, { cookie })).status).toBe(200)
    expect(await gaps()).toEqual([]) // deleted by its owner: no longer counted
  })

  it('a TOR waiting for its review has no gaps yet; one pruned from the newest 50 still counts', async () => {
    const { cookie } = await signUp('ann')
    await save(cookie, { review: [{ id: 'R-1', module: 'M', text: 't' }] })
    expect(await gaps()).toEqual([])
    const { id } = await save(cookie, judged())
    for (let i = 0; i < 50; i++) await save(cookie, { result: [r('R-1', 'full')], coverage: null, valid: {} })
    expect((await call(historyApi.GET, 'GET', `/api/history?id=${id}`, { cookie })).status).toBe(404) // gone from history
    expect((await gaps()).every((e) => e.assessmentId === id)).toBe(true)
    expect(await gaps()).toHaveLength(3)
  })

  it('gathers everyone\'s TORs in one place', async () => {
    const { cookie: a } = await signUp('ann')
    const { cookie: b } = await signUp('bob')
    await save(a, judged(), 'ACME')
    await save(b, judged(), 'BETA')
    expect(new Set((await gaps()).map((e) => e.customer))).toEqual(new Set(['ACME', 'BETA']))
  })

  it('takes the deal result from the TOR: lost marks the gaps it was lost for; won clears them; an old entry is still open', async () => {
    const { cookie } = await signUp('ann')
    const { id } = await save(cookie, judged({ deal: { result: 'lost', lostBecause: ['R-2', 'R-1'] } })) // R-1 is supported: not a gap, ignored
    expect((await gaps()).map((e) => [e.reqId, e.dealResult, e.lostBecause])).toEqual([['R-2', 'lost', true], ['R-3', 'lost', false], ['R-4', 'lost', false]])
    await call(historyApi.PUT, 'PUT', `/api/history?id=${id}`, { cookie, body: { data: judged({ deal: { result: 'won', lostBecause: ['R-2'] } }) } })
    expect((await gaps()).map((e) => [e.dealResult, e.lostBecause])).toEqual([['won', false], ['won', false], ['won', false]])
    await save(cookie, judged()) // saved before deal results existed
    expect((await gaps()).filter((e) => e.assessmentId !== id).every((e) => e.dealResult === 'open' && !e.lostBecause)).toBe(true)
  })

  it('never fails a save when the Scouter cannot be updated', async () => {
    const { cookie } = await signUp('ann')
    const real = db.scoutSync
    db.scoutSync = async () => { throw new Error('relation "scout_evidence" does not exist') }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call(historyApi.POST, 'POST', '/api/history', { cookie, body: { customer: 'ACME', files: [], data: judged() } })
    expect(res.status).toBe(200)
    expect(err).toHaveBeenCalledWith('feature scouter: not updated', 'relation "scout_evidence" does not exist')
    db.scoutSync = real
    err.mockRestore()
  })
})

describe('feature scouter: grouping gaps into needs', () => {
  const gap = (reqId: string, extra: Partial<Evidence> = {}): Evidence => ({
    assessmentId: '00000000-0000-4000-8000-000000000001', reqId, module: 'Dashboard & Report', text: `text ${reqId}`, gap: `gap ${reqId}`, s: 'none', mandatory: true, confirmed: true,
    tor: 'TOR', customer: 'ACME', industry: '', deal: null, due: '', ownerId: null, itemId: null, dealResult: 'open', lostBecause: false, createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '', ...extra,
  })
  const says = (answer: unknown): Llm => (async () => answer) as never
  const seed = async (rows: Evidence[]) => {
    for (const r of rows) await db.scoutSync(r.assessmentId, 'u', [r])
  }

  it('puts each gap into a need we have or a new one, and leaves what the model got wrong ungrouped', async () => {
    const items = [{ id: 'SC-0001', title: 'Branch filter', need: 'ดูแยกสาขา', type: 'ENHANCEMENT' as const, module: 'Dashboard & Report' }]
    const g = await groupGaps(says({
      assignments: [{ gap: 'g1', need: 'SC-0001' }, { gap: 'g2', need: 'N1' }, { gap: 'g3', need: 'N1' }, { gap: 'g4', need: 'SC-9999' }, { gap: 'g9', need: 'N1' }, { gap: 'g1', need: 'N1' }],
      newNeeds: [{ ref: 'N1', title: 'Family account', need: 'ครอบครัวใช้คะแนนร่วมกัน', type: 'BOGUS', module: '' }],
    }), items, [gap('R-1'), gap('R-2', { s: 'custom', module: 'Membership & Tier' }), gap('R-3'), gap('R-4')])
    expect([...g.join]).toEqual([['SC-0001', [{ assessmentId: '00000000-0000-4000-8000-000000000001', reqId: 'R-1' }]]]) // the second answer for g1 is ignored
    expect(g.create).toHaveLength(1)
    expect(g.create[0].gaps.map((k) => k.reqId)).toEqual(['R-2', 'R-3']) // two gaps, one new need
    expect(g.create[0].fields).toEqual({ title: 'Family account', need: 'ครอบครัวใช้คะแนนร่วมกัน', type: 'ENHANCEMENT', module: 'Membership & Tier' }) // no valid type or category: from the first gap
  })

  it('groups the ungrouped gaps into new SC- ids, and a need made by one batch is offered to the next', async () => {
    await seed([gap('R-1', { assessmentId: '00000000-0000-4000-8000-00000000000a' }), gap('R-2', { assessmentId: '00000000-0000-4000-8000-00000000000b' })])
    const seen: string[] = []
    let n = 0
    const llm: Llm = (async (o: { content: { text: string }[] }) => {
      seen.push(o.content[0].text)
      n++
      return n === 1 ? { assignments: [{ gap: 'g1', need: 'N1' }, { gap: 'g2', need: 'N1' }], newNeeds: [{ ref: 'N1', title: 'Branch filter', need: 'ดูแยกสาขา', type: 'ENHANCEMENT', module: 'Dashboard & Report' }] } : { assignments: [], newNeeds: [] }
    }) as never
    expect(await runGrouping(db, llm)).toEqual({ grouped: 2, created: 1, left: 0 })
    expect((await db.scoutItems()).map((x) => [x.id, x.title, x.status, x.editedBy])).toEqual([['SC-0001', 'Branch filter', 'new', 'AI']])
    expect((await db.scoutEvidence()).every((e) => e.itemId === 'SC-0001')).toBe(true)
    await seed([gap('R-3', { assessmentId: '00000000-0000-4000-8000-00000000000c' })])
    await runGrouping(db, llm)
    expect(seen[1]).toContain('SC-0001 [ENHANCEMENT, Dashboard & Report] Branch filter: ดูแยกสาขา') // the need we have, offered for the new gap
  })

  it('anyone signed in reads the Scouter and starts grouping; only an admin edits, moves, merges or makes a need', async () => {
    const { cookie: bob } = await signUp('bob')
    const { cookie: ann } = await signUp('ann')
    await db.setAdmin((await db.userByName('ann'))!.id, true)
    await seed([gap('R-1')])
    const read = await (await call(scouterApi.GET, 'GET', '/api/scouter', { cookie: bob })).json()
    expect(read.gaps[0]).toMatchObject({ reqId: 'R-1', customer: 'ACME' })
    expect(read.gaps[0].ownerId).toBeUndefined() // who saved the TOR is not shared
    expect(read.admin).toBe(false)
    expect((await call(scouterApi.POST, 'POST', '/api/scouter?action=group', { cookie: bob })).status).toBe(409) // no server AI configured in tests
    for (const [fn, m, a, b] of [[scouterApi.POST, 'POST', 'new', { title: 'X', type: 'NEW_FEATURE' }], [scouterApi.POST, 'POST', 'merge', { from: 'SC-0001', into: 'SC-0002' }], [scouterApi.PATCH, 'PATCH', '', { id: 'SC-0001', status: 'planned' }]] as const)
      expect((await call(fn, m, `/api/scouter?action=${a}`, { cookie: bob, body: b })).status).toBe(403)
    const made = await (await call(scouterApi.POST, 'POST', '/api/scouter?action=new', { cookie: ann, body: { title: 'Branch filter', type: 'ENHANCEMENT', gaps: [{ assessmentId: '00000000-0000-4000-8000-000000000001', reqId: 'R-1' }] } })).json()
    expect(made.item).toMatchObject({ id: 'SC-0001', title: 'Branch filter', status: 'new', editedBy: 'ann' })
    const second = (await db.scoutCreateItem({ title: 'Branch report', need: '', type: 'ENHANCEMENT', module: '' }, 'ann', [])).id
    expect((await call(scouterApi.PATCH, 'PATCH', '/api/scouter', { cookie: ann, body: { id: second, status: 'planned', title: 'Branch report (dashboard)' } })).status).toBe(200)
    expect((await db.scoutItems()).find((x) => x.id === second)).toMatchObject({ status: 'planned', title: 'Branch report (dashboard)' })
    expect((await call(scouterApi.PATCH, 'PATCH', '/api/scouter', { cookie: ann, body: { id: second, status: 'someday' } })).status).toBe(400)
    expect((await call(scouterApi.POST, 'POST', '/api/scouter?action=merge', { cookie: ann, body: { from: 'SC-0001', into: second } })).status).toBe(200)
    expect((await db.scoutItems()).map((x) => x.id)).toEqual([second])
    expect((await db.scoutEvidence())[0].itemId).toBe(second) // the gap moved with the merge
    expect((await call(scouterApi.POST, 'POST', '/api/scouter?action=move', { cookie: ann, body: { gaps: [{ assessmentId: '00000000-0000-4000-8000-000000000001', reqId: 'R-1' }], itemId: null } })).status).toBe(200)
    expect((await db.scoutEvidence())[0].itemId).toBeNull() // back to "not grouped"
  })

  it('grouping a saved TOR keeps its need across later edits', async () => {
    const { cookie } = await signUp('ann')
    const r = (id: string, st: string) => ({ id, module: 'M', text: `t ${id}`, s: st, conf: '90%', reason: 'x', evidence: 'e', rec: 'c' })
    const data = { result: [r('R-1', 'none')], coverage: null, valid: {} }
    const { id } = await (await call(historyApi.POST, 'POST', '/api/history', { cookie, body: { customer: 'ACME', files: [], data } })).json()
    const item = await db.scoutCreateItem({ title: 'X', need: '', type: 'NEW_FEATURE', module: 'M' }, 'ann', [{ assessmentId: id, reqId: 'R-1' }])
    await call(historyApi.PUT, 'PUT', `/api/history?id=${id}`, { cookie, body: { data: { ...data, valid: { 'R-1': 'ok' } } } })
    expect((await db.scoutEvidence())[0]).toMatchObject({ itemId: item.id, confirmed: true })
  })
})

describe('admin role', () => {
  it('is reported to the signed-in admin only', async () => {
    const { cookie: a } = await signUp('ann')
    const { cookie: b } = await signUp('bob')
    await db.setAdmin((await db.userByName('ann'))!.id, true)
    expect((await (await call(authApi.GET, 'GET', '/api/auth', { cookie: a })).json()).admin).toBe(true)
    expect((await (await call(authApi.GET, 'GET', '/api/auth', { cookie: b })).json()).admin).toBe(false)
  })

  it('never lets the last admin be demoted, and can demote one of two', async () => {
    await signUp('ann')
    await signUp('bob')
    const ann = (await db.userByName('ann'))!
    const bob = (await db.userByName('bob'))!
    expect(await db.setAdmin('no-such-id', true)).toBe(false)
    await db.setAdmin(ann.id, true)
    expect(await db.setAdmin(ann.id, false)).toBe(false) // the only admin
    await db.setAdmin(bob.id, true)
    expect(await db.setAdmin(ann.id, false)).toBe(true)
    expect(await db.setAdmin(bob.id, false)).toBe(false) // now bob is the only one
  })
})
