import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'

export interface User { id: string; username: string; passwordHash: string; disabled: boolean }
export interface KeyRow { provider: string; model: string; ciphertext: Buffer; iv: Buffer; tag: Buffer; last4: string }
export interface AssessmentInput { customer: string; files: string[]; counts: Record<string, number>; schema: number; data: unknown }
export interface AssessmentRow extends AssessmentInput { id: string; createdAt: string; updatedAt: string }

export const KEEP_ASSESSMENTS = 50

/** Everything the server stores. Every per-user method takes the user id from the session, never from a request body. */
export interface Db {
  createUser(username: string, passwordHash: string): Promise<User | null> // null when the name is taken
  userByName(username: string): Promise<User | undefined>
  setPassword(userId: string, passwordHash: string): Promise<void>
  setDisabled(userId: string, disabled: boolean): Promise<boolean>
  deleteUser(userId: string): Promise<boolean>
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>
  sessionUser(tokenHash: string): Promise<User | undefined> // not expired, not disabled
  deleteSession(tokenHash: string): Promise<void>
  deleteUserSessions(userId: string, exceptTokenHash?: string): Promise<void>
  bump(key: string, windowMs: number): Promise<number> // atomic: failures in the current window after this one
  failures(key: string, windowMs: number): Promise<number>
  clearAttempts(key: string): Promise<void>
  saveKey(userId: string, row: KeyRow): Promise<void>
  getKey(userId: string): Promise<KeyRow | undefined>
  deleteKey(userId: string): Promise<void>
  insertAssessment(userId: string, a: AssessmentInput): Promise<string> // prunes to KEEP_ASSESSMENTS newest
  listAssessments(userId: string): Promise<Omit<AssessmentRow, 'data'>[]>
  getAssessment(userId: string, id: string): Promise<AssessmentRow | undefined>
  updateAssessment(userId: string, id: string, patch: { counts: Record<string, number>; data: unknown }): Promise<boolean>
  deleteAssessment(userId: string, id: string): Promise<boolean>
}

export function memoryDb(): Db {
  const users = new Map<string, User>()
  const sessions = new Map<string, { userId: string; expiresAt: number }>()
  const attempts = new Map<string, { failures: number; start: number }>()
  const keys = new Map<string, KeyRow>()
  const rows = new Map<string, AssessmentRow & { userId: string }>()
  const win = (key: string, windowMs: number) => { const a = attempts.get(key); return a && Date.now() - a.start < windowMs ? a : undefined }
  return {
    async createUser(username, passwordHash) {
      if ([...users.values()].some((u) => u.username === username)) return null
      const u = { id: randomUUID(), username, passwordHash, disabled: false }
      users.set(u.id, u)
      return u
    },
    async userByName(username) { return [...users.values()].find((u) => u.username === username) },
    async setPassword(id, h) { const u = users.get(id); if (u) u.passwordHash = h },
    async setDisabled(id, d) { const u = users.get(id); if (u) u.disabled = d; return !!u },
    async deleteUser(id) {
      for (const [h, s] of sessions) if (s.userId === id) sessions.delete(h)
      keys.delete(id)
      for (const [k, r] of rows) if (r.userId === id) rows.delete(k)
      return users.delete(id)
    },
    async createSession(h, userId, e) { sessions.set(h, { userId, expiresAt: e.getTime() }) },
    async sessionUser(h) {
      const s = sessions.get(h)
      const u = s && users.get(s.userId)
      return s && u && s.expiresAt > Date.now() && !u.disabled ? u : undefined
    },
    async deleteSession(h) { sessions.delete(h) },
    async deleteUserSessions(userId, except) { for (const [h, s] of sessions) if (s.userId === userId && h !== except) sessions.delete(h) },
    async bump(key, windowMs) {
      const a = win(key, windowMs) ?? { failures: 0, start: Date.now() }
      a.failures++
      attempts.set(key, a)
      return a.failures
    },
    async failures(key, windowMs) { return win(key, windowMs)?.failures ?? 0 },
    async clearAttempts(key) { attempts.delete(key) },
    async saveKey(id, row) { keys.set(id, row) },
    async getKey(id) { return keys.get(id) },
    async deleteKey(id) { keys.delete(id) },
    async insertAssessment(userId, a) {
      const id = randomUUID()
      const now = new Date().toISOString()
      rows.set(id, { ...a, id, userId, createdAt: now, updatedAt: now })
      const mine = [...rows.values()].filter((r) => r.userId === userId).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1) || 0)
      for (const r of mine.slice(KEEP_ASSESSMENTS)) rows.delete(r.id)
      return id
    },
    async listAssessments(userId) {
      return [...rows.values()].filter((r) => r.userId === userId).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).map(({ data: _d, userId: _u, ...r }) => r)
    },
    async getAssessment(userId, id) {
      const r = rows.get(id)
      if (!r || r.userId !== userId) return undefined
      const { userId: _u, ...rest } = r
      return rest
    },
    async updateAssessment(userId, id, patch) {
      const r = rows.get(id)
      if (!r || r.userId !== userId) return false
      Object.assign(r, patch, { updatedAt: new Date().toISOString() })
      return true
    },
    async deleteAssessment(userId, id) {
      const r = rows.get(id)
      return !!r && r.userId === userId && rows.delete(id)
    },
  }
}

export function pgDb(pool: Pool): Db {
  const toUser = (r: { id: string; username: string; password_hash: string; disabled: boolean }): User => ({ id: r.id, username: r.username, passwordHash: r.password_hash, disabled: r.disabled })
  const secs = (ms: number) => ms / 1000
  return {
    async createUser(username, hash) {
      const r = await pool.query('insert into users(username, password_hash) values($1,$2) on conflict(username) do nothing returning *', [username, hash])
      return r.rows[0] ? toUser(r.rows[0]) : null
    },
    async userByName(username) { const r = await pool.query('select * from users where username=$1', [username]); return r.rows[0] ? toUser(r.rows[0]) : undefined },
    async setPassword(id, hash) { await pool.query('update users set password_hash=$2 where id=$1', [id, hash]) },
    async setDisabled(id, d) { return ((await pool.query('update users set disabled=$2 where id=$1', [id, d])).rowCount ?? 0) > 0 },
    async deleteUser(id) { return ((await pool.query('delete from users where id=$1', [id])).rowCount ?? 0) > 0 },
    async createSession(h, userId, e) { await pool.query('insert into sessions(token_hash, user_id, expires_at) values($1,$2,$3)', [h, userId, e]) },
    async sessionUser(h) {
      const r = await pool.query('select u.* from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and not u.disabled', [h])
      return r.rows[0] ? toUser(r.rows[0]) : undefined
    },
    async deleteSession(h) { await pool.query('delete from sessions where token_hash=$1', [h]) },
    async deleteUserSessions(userId, except) { await pool.query('delete from sessions where user_id=$1 and ($2::text is null or token_hash<>$2)', [userId, except ?? null]) },
    async bump(key, windowMs) {
      const r = await pool.query(
        `insert into attempts(key, failures, window_start) values($1, 1, now())
         on conflict(key) do update set
           failures = case when attempts.window_start < now() - make_interval(secs => $2) then 1 else attempts.failures + 1 end,
           window_start = case when attempts.window_start < now() - make_interval(secs => $2) then now() else attempts.window_start end
         returning failures`,
        [key, secs(windowMs)],
      )
      return r.rows[0].failures
    },
    async failures(key, windowMs) {
      const r = await pool.query('select failures from attempts where key=$1 and window_start >= now() - make_interval(secs => $2)', [key, secs(windowMs)])
      return r.rows[0]?.failures ?? 0
    },
    async clearAttempts(key) { await pool.query('delete from attempts where key=$1', [key]) },
    async saveKey(id, k) {
      await pool.query(
        `insert into api_keys(user_id, provider, model, ciphertext, iv, tag, last4) values($1,$2,$3,$4,$5,$6,$7)
         on conflict(user_id) do update set provider=$2, model=$3, ciphertext=$4, iv=$5, tag=$6, last4=$7, updated_at=now()`,
        [id, k.provider, k.model, k.ciphertext, k.iv, k.tag, k.last4],
      )
    },
    async getKey(id) {
      const r = await pool.query('select provider, model, ciphertext, iv, tag, last4 from api_keys where user_id=$1', [id])
      return r.rows[0]
    },
    async deleteKey(id) { await pool.query('delete from api_keys where user_id=$1', [id]) },
    async insertAssessment(userId, a) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const r = await c.query('insert into assessments(user_id, customer, files, counts, schema, data) values($1,$2,$3,$4,$5,$6) returning id', [userId, a.customer, a.files, a.counts, a.schema, JSON.stringify(a.data)])
        await c.query('delete from assessments where user_id=$1 and id not in (select id from assessments where user_id=$1 order by created_at desc limit $2)', [userId, KEEP_ASSESSMENTS])
        await c.query('commit')
        return r.rows[0].id
      } catch (e) {
        await c.query('rollback')
        throw e
      } finally {
        c.release()
      }
    },
    async listAssessments(userId) {
      const r = await pool.query('select id, customer, files, counts, schema, created_at, updated_at from assessments where user_id=$1 order by created_at desc', [userId])
      return r.rows.map((x) => ({ id: x.id, customer: x.customer, files: x.files, counts: x.counts, schema: x.schema, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString() }))
    },
    async getAssessment(userId, id) {
      const r = await pool.query('select * from assessments where user_id=$1 and id=$2', [userId, id])
      const x = r.rows[0]
      return x && { id: x.id, customer: x.customer, files: x.files, counts: x.counts, schema: x.schema, data: x.data, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString() }
    },
    async updateAssessment(userId, id, p) {
      return ((await pool.query('update assessments set counts=$3, data=$4, updated_at=now() where user_id=$1 and id=$2', [userId, id, p.counts, JSON.stringify(p.data)])).rowCount ?? 0) > 0
    },
    async deleteAssessment(userId, id) { return ((await pool.query('delete from assessments where user_id=$1 and id=$2', [userId, id])).rowCount ?? 0) > 0 },
  }
}

/** Account mode is on exactly when a database is configured; otherwise the app is the stateless one. */
export const accountMode = () => !!process.env.DATABASE_URL || override !== null

let override: Db | null = null
let shared: Db | undefined
/** Tests inject a memory db (account mode on); `null` puts things back. */
export function setDb(db: Db | null) { override = db; shared = undefined }

export async function getDb(): Promise<Db> {
  if (override) return override
  if (!shared) {
    const { default: pg } = await import('pg') // loaded only in account mode
    shared = pgDb(new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }))
  }
  return shared
}
