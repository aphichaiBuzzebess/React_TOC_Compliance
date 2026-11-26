import { HttpError } from '../server/auth.js'
import { getDb } from '../server/db.js'
import { handle } from '../server/http.js'
import { normaliseEntry, parseEntry, parseUpdate, type EntryData } from '../server/history.js'
import { evidenceOf } from '../server/scout.js'

/** Copy the TOR's gaps to the Feature Scouter. Never fails the save: a missing table (schema not updated yet) or any other error is logged only. */
async function toScouter(run: () => Promise<void>) {
  try {
    await run()
  } catch (e) {
    console.error('feature scouter: not updated', e instanceof Error ? e.message : e)
  }
}

const id = (req: Request) => new URL(req.url).searchParams.get('id') ?? ''
const UUID = /^[0-9a-f-]{36}$/i

// The signed-in user's saved assessments. Every query is scoped by the session's user id.
export async function GET(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    const db = await getDb()
    const one = id(req)
    if (!one) return { entries: await db.listAssessments(user.id) }
    const row = UUID.test(one) ? await db.getAssessment(user.id, one) : undefined
    if (!row) throw new HttpError(404, 'ไม่พบรายการ')
    return { entry: { ...row, data: normaliseEntry(row.data) } }
  })
}

export async function POST(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    const db = await getDb()
    const entry = parseEntry(await req.json().catch(() => null))
    const id = await db.insertAssessment(user.id, entry)
    await toScouter(() => db.scoutSync(id, user.id, evidenceOf(entry.data as EntryData, entry.customer)))
    return { id }
  })
}

export async function PUT(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    const one = id(req)
    const patch = parseUpdate(await req.json().catch(() => null))
    const db = await getDb()
    if (!UUID.test(one) || !(await db.updateAssessment(user.id, one, patch))) throw new HttpError(404, 'ไม่พบรายการ')
    // A PUT carries no customer: it is the one the entry was saved with.
    await toScouter(async () => db.scoutSync(one, user.id, evidenceOf(patch.data, (await db.getAssessment(user.id, one))?.customer ?? '')))
    return { ok: true }
  })
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    const one = id(req)
    const db = await getDb()
    if (!UUID.test(one) || !(await db.deleteAssessment(user.id, one))) throw new HttpError(404, 'ไม่พบรายการ')
    await toScouter(() => db.scoutDropAssessment(one)) // deleted by its owner: no longer counted
    return { ok: true }
  })
}
