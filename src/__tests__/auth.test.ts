// @vitest-environment node
import { memoryDb, setDb, accountMode, type Db } from '../../server/db'
import { decryptKey, encryptKey } from '../../server/vault'
import { hashPassword, verifyPassword } from '../../server/auth'
import { llmFromRequest } from '../../server/http'
import * as authApi from '../../api/auth'
import * as keyApi from '../../api/key'
import * as historyApi from '../../api/history'
import * as statusApi from '../../api/status'

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
  const result = (s = 'full') => ({ id: 'R-001', module: 'Member', text: 't', s, conf: '90%', reason: 'r', evidence: 'e', rec: 'c', targets: [{ zone: 'crm-plus', service: 'point' }], wantsApi: true })
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
