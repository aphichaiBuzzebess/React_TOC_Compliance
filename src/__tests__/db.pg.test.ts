// @vitest-environment node
// Runs only with a real Postgres: TEST_DATABASE_URL=postgres://… npx vitest run src/__tests__/db.pg.test.ts
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { pgDb, type Db } from '../../server/db'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('postgres implementation', () => {
  let pool: pg.Pool
  let db: Db
  const name = `t${Date.now()}`
  const userIds: string[] = []
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 3 })
    await pool.query(readFileSync('db/schema.sql', 'utf8'))
    db = pgDb(pool)
  })
  afterAll(async () => {
    for (const id of userIds) await db.deleteUser(id)
    await pool.query("delete from attempts where key like 'test:%'")
    await pool.end()
  })

  it('creates a user once and finds a session until it expires', async () => {
    const u = (await db.createUser(name, 'h'))!
    userIds.push(u.id)
    expect(await db.createUser(name, 'h2')).toBeNull()
    await db.createSession('tok1', u.id, new Date(Date.now() + 60_000))
    await db.createSession('tok2', u.id, new Date(Date.now() - 1000))
    expect((await db.sessionUser('tok1'))?.id).toBe(u.id)
    expect(await db.sessionUser('tok2')).toBeUndefined()
    await db.setDisabled(u.id, true)
    expect(await db.sessionUser('tok1')).toBeUndefined()
  })

  it('counts attempts atomically', async () => {
    await Promise.all(Array.from({ length: 10 }, () => db.bump('test:k', 60_000)))
    expect(await db.failures('test:k', 60_000)).toBe(10)
    await db.clearAttempts('test:k')
    expect(await db.failures('test:k', 60_000)).toBe(0)
  })

  it('round-trips an encrypted key as bytes', async () => {
    const u = (await db.createUser(`${name}k`, 'h'))!
    userIds.push(u.id)
    const row = { provider: 'gemini', model: 'm', ciphertext: Buffer.from([1, 2, 3, 250]), iv: Buffer.alloc(12, 4), tag: Buffer.alloc(16, 5), last4: '1234' }
    await db.saveKey(u.id, row)
    expect(await db.getKey(u.id)).toMatchObject({ provider: 'gemini', last4: '1234', ciphertext: row.ciphertext, iv: row.iv, tag: row.tag })
  })

  it('keeps assessments per user, prunes to 50, and scopes every call', async () => {
    const a = (await db.createUser(`${name}a`, 'h'))!
    const b = (await db.createUser(`${name}b`, 'h'))!
    userIds.push(a.id, b.id)
    let first = ''
    for (let i = 0; i < 52; i++) { const id = await db.insertAssessment(a.id, { customer: `c${i}`, files: ['f.pdf'], counts: { full: i }, schema: 1, data: { result: [], coverage: null, valid: {} } }); if (i === 0) first = id }
    expect(await db.listAssessments(a.id)).toHaveLength(50)
    expect(await db.getAssessment(a.id, first)).toBeUndefined() // pruned
    const [mine] = await db.listAssessments(a.id)
    expect(await db.getAssessment(b.id, mine.id)).toBeUndefined()
    expect(await db.updateAssessment(b.id, mine.id, { counts: {}, data: {} })).toBe(false)
    expect(await db.deleteAssessment(b.id, mine.id)).toBe(false)
    expect((await db.getAssessment(a.id, mine.id))?.files).toEqual(['f.pdf'])
  }, 120_000) // 52 inserts over the network
})
