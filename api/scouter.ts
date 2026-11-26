import { z } from 'zod'
import { HttpError } from '../server/auth.js'
import { accountMode, getDb, type User } from '../server/db.js'
import { handle, serverDefault } from '../server/http.js'
import { createLlm } from '../server/llm.js'
import { SCOUT_STATUSES, SCOUT_TYPES, backfill, runGrouping } from '../server/scout.js'
import { normaliseEntry } from '../server/history.js'

const action = (req: Request) => new URL(req.url).searchParams.get('action') ?? ''
const body = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as unknown

/** The Scouter is a shared store: it needs accounts and a database. */
function signedIn(user: User | null): User {
  if (!accountMode()) throw new HttpError(403, 'Feature Scouter ต้องเปิดระบบบัญชีก่อน')
  if (!user) throw new HttpError(401, 'login')
  return user
}
/** Product status, grouping and wording are the Product side's call: admins only. */
function admin(user: User | null): string {
  const u = signedIn(user)
  if (!u.isAdmin) throw new HttpError(403, 'เฉพาะ admin เท่านั้นที่แก้ Feature Scouter ได้')
  return u.username
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw)
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
  return r.data
}

const gap = z.object({ assessmentId: z.string().uuid(), reqId: z.string().min(1).max(20) })
const fields = {
  title: z.string().trim().min(1, 'ต้องมีชื่อ').max(80, 'ชื่อยาวเกิน 80 ตัวอักษร'),
  need: z.string().trim().max(300, 'คำอธิบายยาวเกิน 300 ตัวอักษร'),
  type: z.enum(SCOUT_TYPES as [string, ...string[]]),
  module: z.string().trim().max(80),
}
const itemPatch = z.object({ id: z.string().regex(/^SC-\d{4,}$/), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])), status: z.enum(SCOUT_STATUSES as [string, ...string[]]).optional() })
const newItem = z.object({ ...fields, need: fields.need.default(''), module: fields.module.default(''), gaps: z.array(gap).max(200).default([]) })
const move = z.object({ gaps: z.array(gap).min(1).max(200), itemId: z.string().regex(/^SC-\d{4,}$/).nullable() })
const merge = z.object({ from: z.string().regex(/^SC-\d{4,}$/), into: z.string().regex(/^SC-\d{4,}$/) })

// GET: every need and every gap, for anyone signed in. Who saved a TOR is not sent; its customer and deal value are (team decision).
export async function GET(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    signedIn(user)
    const db = await getDb()
    const [items, gaps] = await Promise.all([db.scoutItems(), db.scoutEvidence()])
    return { items, gaps: gaps.map(({ ownerId: _o, ...g }) => g), admin: user!.isAdmin }
  })
}

// POST ?action=group (anyone signed in: it only sorts gaps, with the server's AI) | backfill | new | move | merge (admins)
export async function POST(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    const db = await getDb()
    const a = action(req)
    if (a === 'group') {
      signedIn(user)
      const d = serverDefault()
      if (!d) throw new HttpError(409, 'server ยังไม่ได้ตั้ง AI ไว้ จึงจัดกลุ่มอัตโนมัติไม่ได้ ให้ admin จัดกลุ่มเอง')
      return runGrouping(db, createLlm(d))
    }
    const by = admin(user)
    // TORs saved before the Scouter existed: copy their gaps in (grouping is a separate step, run next).
    if (a === 'backfill') return backfill(db, normaliseEntry)
    if (a === 'new') {
      const { gaps, ...f } = parse(newItem, await body(req))
      return { item: await db.scoutCreateItem(f as Parameters<typeof db.scoutCreateItem>[0], by, gaps) }
    }
    if (a === 'move') {
      const m = parse(move, await body(req))
      const n = await db.scoutAssign(m.gaps, m.itemId)
      if (m.itemId && n === 0) throw new HttpError(404, 'ไม่พบรายการนี้')
      return { moved: n }
    }
    if (a === 'merge') {
      const m = parse(merge, await body(req))
      if (!(await db.scoutMerge(m.from, m.into, by))) throw new HttpError(404, 'รวมไม่ได้: ไม่พบรายการ หรือเป็นรายการเดียวกัน')
      return { ok: true }
    }
    throw new HttpError(400, 'action ไม่ถูกต้อง')
  })
}

// PATCH: a need's title, description, type, category or product status (admins).
export async function PATCH(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    const by = admin(user)
    const { id, ...patch } = parse(itemPatch, await body(req))
    const item = await (await getDb()).scoutUpdateItem(id as string, patch as Parameters<Awaited<ReturnType<typeof getDb>>['scoutUpdateItem']>[1], by)
    if (!item) throw new HttpError(404, 'ไม่พบรายการนี้')
    return { item }
  })
}
