// @vitest-environment node
import { memoryDb, setDb, KEEP_VERSIONS, type Db } from '../../server/db'

let db: Db
beforeEach(() => { db = memoryDb(); setDb(db) })
afterEach(() => setDb(null))

describe('knowledge items in the db', () => {
  it('creates, updates and keeps the previous content as a version', async () => {
    const a = (await db.kbPut('prompt', 'judge', { body: 'v1' }, 'ann', null)) as { updatedAt: string }
    expect(a.updatedAt).toBeTruthy()
    const b = (await db.kbPut('prompt', 'judge', { body: 'v2' }, 'bob', a.updatedAt)) as { updatedAt: string }
    expect(b.updatedAt).not.toBe(a.updatedAt)
    expect((await db.kbGet('prompt', 'judge'))!.data).toEqual({ body: 'v2' })
    const v = await db.kbVersions('prompt', 'judge')
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ data: { body: 'v1' }, by: 'ann' })
  })

  it('refuses a stale or duplicate save', async () => {
    const a = (await db.kbPut('note', 'a.md', { t: 1 }, 'ann', null)) as { updatedAt: string }
    expect(await db.kbPut('note', 'a.md', { t: 2 }, 'bob', null)).toBe('conflict') // already exists
    await db.kbPut('note', 'a.md', { t: 3 }, 'ann', a.updatedAt)
    expect(await db.kbPut('note', 'a.md', { t: 4 }, 'bob', a.updatedAt)).toBe('conflict') // bob loaded the old one
    expect(await db.kbPut('note', 'gone.md', { t: 1 }, 'bob', 'some-old-token')).toBe('conflict')
    expect((await db.kbGet('note', 'a.md'))!.data).toEqual({ t: 3 })
  })

  it('keeps only the newest versions', async () => {
    let t: string | null = null
    for (let i = 0; i < KEEP_VERSIONS + 5; i++) t = ((await db.kbPut('prompt', 'extract', { body: `v${i}` }, 'ann', t)) as { updatedAt: string }).updatedAt
    const v = await db.kbVersions('prompt', 'extract')
    expect(v).toHaveLength(KEEP_VERSIONS)
    expect((v[0].data as { body: string }).body).toBe(`v${KEEP_VERSIONS + 3}`)
  })

  it('delete keeps the content as a version and lists the key as deleted', async () => {
    const a = (await db.kbPut('note', 'x/y.md', { title: 'Y' }, 'ann', null)) as { updatedAt: string }
    expect(await db.kbDelete('note', 'x/y.md', 'bob', 'stale')).toBe('conflict')
    expect(await db.kbDelete('note', 'x/y.md', 'bob', a.updatedAt)).toBe(true)
    expect(await db.kbGet('note', 'x/y.md')).toBeUndefined()
    expect((await db.kbDeletedKeys('note')).map((d) => d.key)).toEqual(['x/y.md'])
    expect(await db.kbDelete('note', 'x/y.md', 'bob', a.updatedAt)).toBe(false)
  })

  it('seeds only what is neither live nor ever existed', async () => {
    await db.kbPut('note', 'live.md', { t: 1 }, 'ann', null)
    const gone = (await db.kbPut('note', 'gone.md', { t: 1 }, 'ann', null)) as { updatedAt: string }
    await db.kbDelete('note', 'gone.md', 'ann', gone.updatedAt)
    const n = await db.kbSeed('note', [{ key: 'live.md', data: {} }, { key: 'gone.md', data: {} }, { key: 'new.md', data: { t: 9 } }], 'import')
    expect(n).toBe(1)
    expect((await db.kbList('note')).map((i) => i.key)).toEqual(['live.md', 'new.md'])
    expect((await db.kbGet('note', 'new.md'))!.updatedBy).toBe('import')
  })

  it('keeps kinds apart and stores meta', async () => {
    await db.kbPut('prompt', 'k', { body: 'p' }, 'a', null)
    await db.kbPut('note', 'k', { body: 'n' }, 'a', null)
    expect((await db.kbGet('prompt', 'k'))!.data).toEqual({ body: 'p' })
    expect(await db.kbList('taxonomy')).toEqual([])
    expect(await db.getMeta('seeded_at')).toBeUndefined()
    await db.setMeta('seeded_at', 'now')
    expect(await db.getMeta('seeded_at')).toBe('now')
  })
})
