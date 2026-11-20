import { z } from 'zod'
import { HttpError } from './auth.js'
import type { AssessmentInput } from './db.js'

export const SCHEMA = 1
export const MAX_BYTES = 2 * 1024 * 1024

const str = (n: number) => z.string().transform((s) => s.slice(0, n)) // long model text is cut, not refused
const key = z.string().max(20)
const target = z.object({ zone: str(40), service: str(40) })
const req = z.object({
  id: str(20),
  module: str(80),
  text: str(2000),
  targets: z.array(target).max(3).optional(),
  wantsApi: z.boolean().optional(),
  s: z.enum(['full', 'config', 'custom', 'integ', 'none', 'verify']),
  conf: str(10),
  reason: str(4000),
  evidence: str(4000),
  rec: str(4000),
})
const coverage = z.object({
  function: str(120),
  coverage: z.enum(['covered', 'partial', 'missing']),
  reqIds: z.array(str(20)).max(500),
  open: z.array(str(300)).max(200),
})
const data = z.object({
  result: z.array(req).max(1000),
  coverage: z.array(coverage).max(100).nullable().default(null),
  valid: z.record(key, z.enum(['ok', 'flag'])).default({}),
})
const entry = z.object({
  customer: str(120).default(''),
  files: z.array(str(200)).max(20).default([]),
  data,
})
const update = z.object({ data })

export type EntryData = z.infer<typeof data>

const COUNT_KEYS = ['full', 'config', 'custom', 'integ', 'none', 'verify'] as const
const countsOf = (d: EntryData) => Object.fromEntries(COUNT_KEYS.map((k) => [k, d.result.filter((r) => r.s === k).length]))

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body)
  if (!r.success) throw new HttpError(400, 'ข้อมูลประวัติไม่ถูกต้อง')
  if (JSON.stringify(r.data).length > MAX_BYTES) throw new HttpError(413, 'ไม่ได้บันทึกประวัติ: ผลใหญ่เกินไป')
  return r.data
}

/** A new history entry from a finished run. Unknown fields are dropped; counts are computed here, not trusted. */
export function parseEntry(body: unknown): AssessmentInput {
  const e = parse(entry, body)
  return { customer: e.customer, files: e.files, counts: countsOf(e.data), schema: SCHEMA, data: e.data }
}

export function parseUpdate(body: unknown): { counts: Record<string, number>; data: EntryData } {
  const { data } = parse(update, body)
  return { counts: countsOf(data), data }
}

/** What the client gets back when opening an entry: older shapes are filled in, a stored shape that no longer validates is refused. */
export function normaliseEntry(raw: unknown): EntryData {
  const r = data.safeParse(raw)
  if (!r.success) throw new HttpError(422, 'เปิดรายการนี้ไม่ได้')
  return r.data
}
