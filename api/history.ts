import { HttpError } from '../server/auth.js'
import { getDb } from '../server/db.js'
import { handle } from '../server/http.js'
import { normaliseEntry, parseEntry, parseUpdate } from '../server/history.js'

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
    return { id: await (await getDb()).insertAssessment(user.id, parseEntry(await req.json().catch(() => null))) }
  })
}

export async function PUT(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    const one = id(req)
    const patch = parseUpdate(await req.json().catch(() => null))
    if (!UUID.test(one) || !(await (await getDb()).updateAssessment(user.id, one, patch))) throw new HttpError(404, 'ไม่พบรายการ')
    return { ok: true }
  })
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    const one = id(req)
    if (!UUID.test(one) || !(await (await getDb()).deleteAssessment(user.id, one))) throw new HttpError(404, 'ไม่พบรายการ')
    return { ok: true }
  })
}
