import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { scoutId, scoutNo, type Evidence, type EvidenceInput, type GapKey, type ScoutItem, type ScoutItemFields, type ScoutStatus } from './scout.js'

export interface User { id: string; username: string; passwordHash: string; disabled: boolean; isAdmin: boolean }
export interface KeyRow { provider: string; model: string; ciphertext: Buffer; iv: Buffer; tag: Buffer; last4: string }
export interface AssessmentInput { customer: string; files: string[]; counts: Record<string, number>; schema: number; data: unknown }
export interface AssessmentRow extends AssessmentInput { id: string; createdAt: string; updatedAt: string }
/** A row of the list: everything but the data, plus the project title and due date read out of it ('' when absent). */
export type AssessmentListRow = Omit<AssessmentRow, 'data'> & { title: string; due: string }
type MetaBits = { meta?: { title?: unknown; due?: unknown } } | null | undefined
const metaBits = (data: unknown) => { const m = (data as MetaBits)?.meta; return { title: typeof m?.title === 'string' ? m.title : '', due: typeof m?.due === 'string' ? m.due : '' } }

export const KEEP_ASSESSMENTS = 50
export const KEEP_VERSIONS = 20

export type KbKind = 'note' | 'prompt' | 'taxonomy'
/** `updatedAt` is an opaque token: the editor sends back what it loaded and the save fails (conflict) if the row changed since. */
export interface KbItem { key: string; data: unknown; updatedBy: string; updatedAt: string }
export interface KbVersion { id: number; kind: KbKind; key: string; data: unknown; by: string; at: string }

/** Everything the server stores. Every per-user method takes the user id from the session, never from a request body. */
export interface Db {
  createUser(username: string, passwordHash: string): Promise<User | null> // null when the name is taken
  userByName(username: string): Promise<User | undefined>
  setPassword(userId: string, passwordHash: string): Promise<void>
  setDisabled(userId: string, disabled: boolean): Promise<boolean>
  setAdmin(userId: string, admin: boolean): Promise<boolean> // false if the user is unknown, or if this would remove the last admin
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
  listAssessments(userId: string): Promise<AssessmentListRow[]>
  getAssessment(userId: string, id: string): Promise<AssessmentRow | undefined>
  updateAssessment(userId: string, id: string, patch: { counts: Record<string, number>; data: unknown }): Promise<boolean>
  deleteAssessment(userId: string, id: string): Promise<boolean>

  kbList(kind: KbKind): Promise<KbItem[]>
  kbGet(kind: KbKind, key: string): Promise<KbItem | undefined>
  /** `expected`: undefined = no check; null = the item must not exist; a token = it must still be that version. Keeps the previous content as a version. */
  kbPut(kind: KbKind, key: string, data: unknown, by: string, expected?: string | null): Promise<KbItem | 'conflict'>
  kbDelete(kind: KbKind, key: string, by: string, expected: string): Promise<boolean | 'conflict'>
  kbVersions(kind: KbKind, key: string): Promise<KbVersion[]> // newest first
  kbVersion(id: number): Promise<KbVersion | undefined>
  kbDeletedKeys(kind: KbKind): Promise<{ key: string; data: unknown; at: string }[]> // keys with versions but no live item
  kbSeed(kind: KbKind, items: { key: string; data: unknown }[], by: string): Promise<number> // inserts items with no live row and no history
  /** Feature Scouter: replace one TOR's gaps with `rows`, keeping what people set on the ones that stay (grouping, deal result). */
  scoutSync(assessmentId: string, ownerId: string, rows: EvidenceInput[]): Promise<void>
  /** The TOR was deleted by its owner: its gaps leave the Scouter. */
  scoutDropAssessment(assessmentId: string): Promise<void>
  scoutEvidence(): Promise<Evidence[]>
  scoutItems(): Promise<ScoutItem[]>
  /** A new need with the next SC-0000 id; the given gaps are grouped into it. */
  scoutCreateItem(fields: ScoutItemFields, by: string, gaps: GapKey[]): Promise<ScoutItem>
  scoutUpdateItem(id: string, patch: Partial<ScoutItemFields & { status: ScoutStatus }>, by: string): Promise<ScoutItem | undefined>
  /** Group gaps into a need, or (null) back into "not grouped". Gaps that do not exist are skipped. */
  scoutAssign(gaps: GapKey[], itemId: string | null): Promise<number>
  /** Every gap of `from` goes to `into`; `from` is removed. */
  scoutMerge(from: string, into: string, by: string): Promise<boolean>
  getMeta(key: string): Promise<string | undefined>
  setMeta(key: string, value: string): Promise<void>
}

export function memoryDb(): Db {
  const users = new Map<string, User>()
  const sessions = new Map<string, { userId: string; expiresAt: number }>()
  const attempts = new Map<string, { failures: number; start: number }>()
  const keys = new Map<string, KeyRow>()
  const rows = new Map<string, AssessmentRow & { userId: string }>()
  const kb = new Map<string, KbItem>() // `${kind}\u0000${key}`
  const versions: KbVersion[] = []
  const meta = new Map<string, string>()
  const evidence = new Map<string, Evidence>() // `${assessmentId}\u0000${reqId}`
  const scoutItems = new Map<string, ScoutItem>()
  let seq = 0
  let vseq = 0
  const id = (kind: string, key: string) => `${kind}\u0000${key}`
  const token = () => `${new Date().toISOString()}-${String(++seq).padStart(6, '0')}`
  const keep = (kind: KbKind, key: string, data: unknown, by: string, at: string) => {
    versions.push({ id: ++vseq, kind, key, data, by, at })
    const mine = versions.filter((v) => v.kind === kind && v.key === key).sort((a, b) => b.id - a.id)
    for (const v of mine.slice(KEEP_VERSIONS)) versions.splice(versions.indexOf(v), 1)
  }
  const win = (key: string, windowMs: number) => { const a = attempts.get(key); return a && Date.now() - a.start < windowMs ? a : undefined }
  return {
    async createUser(username, passwordHash) {
      if ([...users.values()].some((u) => u.username === username)) return null
      const u = { id: randomUUID(), username, passwordHash, disabled: false, isAdmin: false }
      users.set(u.id, u)
      return u
    },
    async userByName(username) { return [...users.values()].find((u) => u.username === username) },
    async setPassword(id, h) { const u = users.get(id); if (u) u.passwordHash = h },
    async setDisabled(id, d) { const u = users.get(id); if (u) u.disabled = d; return !!u },
    async setAdmin(id, admin) {
      const u = users.get(id)
      if (!u) return false
      if (!admin && u.isAdmin && ![...users.values()].some((x) => x.isAdmin && x.id !== id)) return false // never the last admin
      u.isAdmin = admin
      return true
    },
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
      return [...rows.values()].filter((r) => r.userId === userId).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).map(({ data, userId: _u, ...r }) => ({ ...r, ...metaBits(data) }))
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
    async kbList(kind) { return [...kb.entries()].filter(([k]) => k.startsWith(`${kind}\u0000`)).map(([, v]) => v).sort((a, b) => (a.key < b.key ? -1 : 1)) },
    async kbGet(kind, key) { return kb.get(id(kind, key)) },
    async kbPut(kind, key, data, by, expected) {
      const cur = kb.get(id(kind, key))
      if (expected === null && cur) return 'conflict'
      if (typeof expected === 'string' && cur?.updatedAt !== expected) return 'conflict'
      if (cur) keep(kind, key, cur.data, cur.updatedBy, cur.updatedAt)
      const item = { key, data, updatedBy: by, updatedAt: token() }
      kb.set(id(kind, key), item)
      return item
    },
    async kbDelete(kind, key, _by, expected) {
      const cur = kb.get(id(kind, key))
      if (!cur) return false
      if (cur.updatedAt !== expected) return 'conflict'
      keep(kind, key, cur.data, cur.updatedBy, cur.updatedAt)
      kb.delete(id(kind, key))
      return true
    },
    async kbVersions(kind, key) { return versions.filter((v) => v.kind === kind && v.key === key).sort((a, b) => b.id - a.id) },
    async kbVersion(vid) { return versions.find((v) => v.id === vid) },
    async kbDeletedKeys(kind) {
      const gone = new Map<string, KbVersion>()
      for (const v of versions) if (v.kind === kind && !kb.has(id(kind, v.key)) && (!gone.get(v.key) || gone.get(v.key)!.id < v.id)) gone.set(v.key, v)
      return [...gone.values()].map((v) => ({ key: v.key, data: v.data, at: v.at }))
    },
    async kbSeed(kind, items, by) {
      let n = 0
      for (const it of items) {
        if (kb.has(id(kind, it.key)) || versions.some((v) => v.kind === kind && v.key === it.key)) continue
        kb.set(id(kind, it.key), { key: it.key, data: it.data, updatedBy: by, updatedAt: token() })
        n++
      }
      return n
    },
    async scoutSync(assessmentId, ownerId, input) {
      const now = new Date().toISOString()
      const keep = new Set(input.map((r) => r.reqId))
      for (const [k, e] of evidence) if (e.assessmentId === assessmentId && !keep.has(e.reqId)) evidence.delete(k)
      for (const r of input) {
        const k = `${assessmentId}\u0000${r.reqId}`
        const cur = evidence.get(k)
        evidence.set(k, { ...r, assessmentId, ownerId, itemId: cur?.itemId ?? null, dealResult: cur?.dealResult ?? 'open', lostBecause: cur?.lostBecause ?? false, createdAt: cur?.createdAt ?? now, updatedAt: now })
      }
    },
    async scoutDropAssessment(assessmentId) {
      for (const [k, e] of evidence) if (e.assessmentId === assessmentId) evidence.delete(k)
    },
    async scoutEvidence() { return [...evidence.values()].map((e) => ({ ...e })) },
    async scoutItems() { return [...scoutItems.values()].map((x) => ({ ...x })) },
    async scoutCreateItem(fields, by, gaps) {
      const now = new Date().toISOString()
      const id = scoutId(Math.max(0, ...[...scoutItems.keys()].map(scoutNo)) + 1)
      const item: ScoutItem = { id, ...fields, status: 'new', editedBy: by, createdAt: now, updatedAt: now }
      scoutItems.set(id, item)
      for (const g of gaps) { const e = evidence.get(`${g.assessmentId}\u0000${g.reqId}`); if (e) e.itemId = id }
      return { ...item }
    },
    async scoutUpdateItem(id, patch, by) {
      const cur = scoutItems.get(id)
      if (!cur) return undefined
      Object.assign(cur, patch, { editedBy: by, updatedAt: new Date().toISOString() })
      return { ...cur }
    },
    async scoutAssign(gaps, itemId) {
      if (itemId !== null && !scoutItems.has(itemId)) return 0
      let n = 0
      for (const g of gaps) { const e = evidence.get(`${g.assessmentId}\u0000${g.reqId}`); if (e) { e.itemId = itemId; n++ } }
      return n
    },
    async scoutMerge(from, into, by) {
      if (from === into || !scoutItems.has(from) || !scoutItems.has(into)) return false
      for (const e of evidence.values()) if (e.itemId === from) e.itemId = into
      scoutItems.delete(from)
      Object.assign(scoutItems.get(into)!, { editedBy: by, updatedAt: new Date().toISOString() })
      return true
    },
    async getMeta(key) { return meta.get(key) },
    async setMeta(key, value) { meta.set(key, value) },
  }
}

// Microsecond text form of a timestamp: it is the version token, so it must not lose precision.
const AT = `to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const VAT = `to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const toItem = (r: { key: string; data: unknown; edited_by: string; at: string }): KbItem => ({ key: r.key, data: r.data, updatedBy: r.edited_by, updatedAt: r.at })
const toVersion = (r: { id: string | number; kind: KbKind; key: string; data: unknown; edited_by: string; at: string }): KbVersion => ({ id: Number(r.id), kind: r.kind, key: r.key, data: r.data, by: r.edited_by, at: r.at })

export function pgDb(pool: Pool): Db {
  /** One transaction on one connection. */
  async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect()
    try {
      await c.query('begin')
      const out = await fn(c)
      await c.query('commit')
      return out
    } catch (e) {
      await c.query('rollback')
      throw e
    } finally {
      c.release()
    }
  }
  const prune = (c: PoolClient, kind: string, key: string) =>
    c.query('delete from kb_versions where kind=$1 and key=$2 and id not in (select id from kb_versions where kind=$1 and key=$2 order by id desc limit $3)', [kind, key, KEEP_VERSIONS])
  const toUser = (r: { id: string; username: string; password_hash: string; disabled: boolean; is_admin: boolean }): User => ({ id: r.id, username: r.username, passwordHash: r.password_hash, disabled: r.disabled, isAdmin: r.is_admin })
  const secs = (ms: number) => ms / 1000
  return {
    async createUser(username, hash) {
      const r = await pool.query('insert into users(username, password_hash) values($1,$2) on conflict(username) do nothing returning *', [username, hash])
      return r.rows[0] ? toUser(r.rows[0]) : null
    },
    async userByName(username) { const r = await pool.query('select * from users where username=$1', [username]); return r.rows[0] ? toUser(r.rows[0]) : undefined },
    async setPassword(id, hash) { await pool.query('update users set password_hash=$2 where id=$1', [id, hash]) },
    async setDisabled(id, d) { return ((await pool.query('update users set disabled=$2 where id=$1', [id, d])).rowCount ?? 0) > 0 },
    async setAdmin(id, admin) {
      // One statement, so two demotions at once cannot both pass the "another admin exists" check.
      const sql = admin ? 'update users set is_admin=true where id=$1' : 'update users set is_admin=false where id=$1 and (not is_admin or exists (select 1 from users where is_admin and id<>$1))'
      return ((await pool.query(sql, [id])).rowCount ?? 0) > 0
    },
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
      const r = await pool.query("select id, customer, files, counts, schema, created_at, updated_at, data->'meta' as meta from assessments where user_id=$1 order by created_at desc", [userId])
      return r.rows.map((x) => ({ id: x.id, customer: x.customer, files: x.files, counts: x.counts, schema: x.schema, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString(), ...metaBits({ meta: x.meta }) }))
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

    async kbList(kind) {
      const r = await pool.query(`select key, data, edited_by, ${AT} as at from kb_items where kind=$1 order by key`, [kind])
      return r.rows.map(toItem)
    },
    async kbGet(kind, key) {
      const r = await pool.query(`select key, data, edited_by, ${AT} as at from kb_items where kind=$1 and key=$2`, [kind, key])
      return r.rows[0] ? toItem(r.rows[0]) : undefined
    },
    async kbPut(kind, key, data, by, expected) {
      return tx(async (c) => {
        const cur = (await c.query(`select data, edited_by, ${AT} as at, updated_at from kb_items where kind=$1 and key=$2 for update`, [kind, key])).rows[0]
        if (expected === null && cur) return 'conflict' as const
        if (typeof expected === 'string' && cur?.at !== expected) return 'conflict' as const
        if (cur) await c.query('insert into kb_versions(kind, key, data, edited_by, at) values($1,$2,$3,$4,$5)', [kind, key, JSON.stringify(cur.data), cur.edited_by, cur.updated_at])
        const r = await c.query(
          `insert into kb_items(kind, key, data, edited_by) values($1,$2,$3,$4)
           on conflict (kind, key) do update set data=$3, edited_by=$4, updated_at=now()
           returning key, data, edited_by, ${AT} as at`,
          [kind, key, JSON.stringify(data), by],
        )
        await prune(c, kind, key)
        return toItem(r.rows[0])
      })
    },
    async kbDelete(kind, key, _by, expected) {
      return tx(async (c) => {
        const cur = (await c.query(`select data, edited_by, ${AT} as at, updated_at from kb_items where kind=$1 and key=$2 for update`, [kind, key])).rows[0]
        if (!cur) return false
        if (cur.at !== expected) return 'conflict' as const
        await c.query('insert into kb_versions(kind, key, data, edited_by, at) values($1,$2,$3,$4,$5)', [kind, key, JSON.stringify(cur.data), cur.edited_by, cur.updated_at])
        await c.query('delete from kb_items where kind=$1 and key=$2', [kind, key])
        await prune(c, kind, key)
        return true
      })
    },
    async kbVersions(kind, key) {
      const r = await pool.query(`select id, kind, key, data, edited_by, ${VAT} as at from kb_versions where kind=$1 and key=$2 order by id desc`, [kind, key])
      return r.rows.map(toVersion)
    },
    async kbVersion(vid) {
      const r = await pool.query(`select id, kind, key, data, edited_by, ${VAT} as at from kb_versions where id=$1`, [vid])
      return r.rows[0] ? toVersion(r.rows[0]) : undefined
    },
    async kbDeletedKeys(kind) {
      const r = await pool.query(
        `select distinct on (v.key) v.key, v.data, ${VAT} as at from kb_versions v
         where v.kind=$1 and not exists (select 1 from kb_items i where i.kind=v.kind and i.key=v.key)
         order by v.key, v.id desc`,
        [kind],
      )
      return r.rows.map((x) => ({ key: x.key, data: x.data, at: x.at }))
    },
    async kbSeed(kind, items, by) {
      let n = 0
      for (const it of items) {
        const r = await pool.query(
          `insert into kb_items(kind, key, data, edited_by)
           select $1,$2,$3,$4 where not exists (select 1 from kb_versions where kind=$1 and key=$2)
           on conflict (kind, key) do nothing`,
          [kind, it.key, JSON.stringify(it.data), by],
        )
        n += r.rowCount ?? 0
      }
      return n
    },
    async scoutSync(assessmentId, ownerId, input) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        await c.query('delete from scout_evidence where assessment_id=$1 and not (req_id = any($2::text[]))', [assessmentId, input.map((r) => r.reqId)])
        if (input.length)
          await c.query(
            `insert into scout_evidence(assessment_id, req_id, owner_id, data, confirmed)
             select $1, x->>'reqId', $2, x, (x->>'confirmed')::boolean from jsonb_array_elements($3::jsonb) x
             on conflict (assessment_id, req_id) do update set data=excluded.data, confirmed=excluded.confirmed, owner_id=excluded.owner_id, updated_at=now()`,
            [assessmentId, ownerId, JSON.stringify(input)],
          )
        await c.query('commit')
      } catch (e) {
        await c.query('rollback')
        throw e
      } finally {
        c.release()
      }
    },
    async scoutDropAssessment(assessmentId) { await pool.query('delete from scout_evidence where assessment_id=$1', [assessmentId]) },
    async scoutEvidence() {
      const r = await pool.query('select assessment_id, owner_id, item_id, data, confirmed, deal_result, lost_because, created_at, updated_at from scout_evidence')
      return r.rows.map((x) => ({ ...(x.data as EvidenceInput), confirmed: x.confirmed, assessmentId: x.assessment_id, ownerId: x.owner_id, itemId: x.item_id, dealResult: x.deal_result, lostBecause: x.lost_because, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString() }))
    },
    async scoutItems() {
      const r = await pool.query('select id, title, need, type, module, status, edited_by, created_at, updated_at from scout_items order by id')
      return r.rows.map((x) => ({ id: x.id, title: x.title, need: x.need, type: x.type, module: x.module, status: x.status, editedBy: x.edited_by, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString() }))
    },
    async scoutCreateItem(fields, by, gaps) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        await c.query('lock table scout_items in share row exclusive mode') // two groupings at once must not take the same id
        const max = (await c.query("select coalesce(max(substring(id from 4)::int), 0) as n from scout_items")).rows[0].n as number
        const x = (await c.query(
          'insert into scout_items(id, title, need, type, module, edited_by) values($1,$2,$3,$4,$5,$6) returning id, title, need, type, module, status, edited_by, created_at, updated_at',
          [scoutId(Number(max) + 1), fields.title, fields.need, fields.type, fields.module, by],
        )).rows[0]
        for (const g of gaps) await c.query('update scout_evidence set item_id=$1 where assessment_id=$2 and req_id=$3', [x.id, g.assessmentId, g.reqId])
        await c.query('commit')
        return { id: x.id, title: x.title, need: x.need, type: x.type, module: x.module, status: x.status, editedBy: x.edited_by, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString() }
      } catch (e) {
        await c.query('rollback')
        throw e
      } finally {
        c.release()
      }
    },
    async scoutUpdateItem(id, patch, by) {
      const cols = (['title', 'need', 'type', 'module', 'status'] as const).filter((k) => patch[k] !== undefined)
      const r = await pool.query(
        `update scout_items set ${cols.map((k, i) => `${k}=$${i + 3}`).join(', ')}${cols.length ? ', ' : ''}edited_by=$2, updated_at=now() where id=$1 returning id, title, need, type, module, status, edited_by, created_at, updated_at`,
        [id, by, ...cols.map((k) => patch[k])],
      )
      const x = r.rows[0]
      return x && { id: x.id, title: x.title, need: x.need, type: x.type, module: x.module, status: x.status, editedBy: x.edited_by, createdAt: new Date(x.created_at).toISOString(), updatedAt: new Date(x.updated_at).toISOString() }
    },
    async scoutAssign(gaps, itemId) {
      if (itemId !== null && !(await pool.query('select 1 from scout_items where id=$1', [itemId])).rowCount) return 0
      let n = 0
      for (const g of gaps) n += (await pool.query('update scout_evidence set item_id=$1 where assessment_id=$2 and req_id=$3', [itemId, g.assessmentId, g.reqId])).rowCount ?? 0
      return n
    },
    async scoutMerge(from, into, by) {
      if (from === into) return false
      const c = await pool.connect()
      try {
        await c.query('begin')
        const both = (await c.query('select id from scout_items where id = any($1::text[])', [[from, into]])).rowCount
        if (both !== 2) { await c.query('rollback'); return false }
        await c.query('update scout_evidence set item_id=$2 where item_id=$1', [from, into])
        await c.query('delete from scout_items where id=$1', [from])
        await c.query('update scout_items set edited_by=$2, updated_at=now() where id=$1', [into, by])
        await c.query('commit')
        return true
      } catch (e) {
        await c.query('rollback')
        throw e
      } finally {
        c.release()
      }
    },
    async getMeta(key) { return (await pool.query('select value from kb_meta where key=$1', [key])).rows[0]?.value },
    async setMeta(key, value) { await pool.query('insert into kb_meta(key, value) values($1,$2) on conflict (key) do update set value=$2', [key, value]) },
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
