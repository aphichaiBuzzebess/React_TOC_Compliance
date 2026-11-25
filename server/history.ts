import { z } from 'zod'
import { HttpError } from './auth.js'
import type { AssessmentInput } from './db.js'
import { legacyTarget } from '../src/data/taxonomy.js'

export const SCHEMA = 1
export const MAX_BYTES = 2 * 1024 * 1024

const str = (n: number) => z.string().transform((s) => s.slice(0, n)) // long model text is cut, not refused
const key = z.string().max(20)
const target = z.preprocess(legacyTarget, z.object({ solution: str(40), service: str(40) })) // saved before the rename: { zone, service }
const status = z.enum(['full', 'config', 'custom', 'integ', 'none', 'verify'])
/** A requirement as extracted, before it is judged: what the review step edits. */
const raw = {
  id: str(20),
  module: str(80),
  text: str(2000),
  targets: z.array(target).max(3).optional(),
  wantsApi: z.boolean().optional(),
  pri: z.enum(['M', 'O']).optional(),
  ref: str(40).optional(),
  orig: str(600).optional(),
  amb: str(300).optional(),
}
const pending = z.object({ ...raw, inf: z.boolean().optional(), seen: z.boolean().optional() })
const req = z.object({
  ...raw,
  s: status,
  conf: str(10),
  reason: str(4000),
  evidence: str(4000),
  rec: str(4000),
  gap: str(1000).optional(),
  q: str(500).optional(),
  override: z.object({ from: status, note: str(500) }).optional(),
})
const term = z.object({ id: str(20), text: str(2000), ref: str(40).optional(), ok: z.boolean().optional() })
const coverage = z.object({
  function: str(120),
  coverage: z.enum(['covered', 'partial', 'missing']),
  reqIds: z.array(str(20)).max(500),
  open: z.array(str(300)).max(200),
})
/** What the BD typed about the project on the upload form. Every field is optional; older entries have none. */
const meta = z.object({
  title: str(200).default(''),
  industry: str(80).default(''),
  sub: str(80).default(''),
  leaf: str(120).default(''),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default(''),
  value: z.number().int().nonnegative().max(1e13).nullable().default(null),
})
export type ProjectMeta = z.infer<typeof meta>

/** An entry is either waiting for its review (`review` set, `result` empty) or judged (`review` null). */
const data = z.object({
  meta: meta.optional(),
  scope: str(600).default(''),
  review: z.array(pending).max(1000).nullable().default(null),
  terms: z.array(term).max(300).default([]),
  confirmed: z.object({ by: str(120), at: str(40) }).nullable().default(null),
  result: z.array(req).max(1000).default([]),
  coverage: z.array(coverage).max(100).nullable().default(null),
  valid: z.record(key, z.enum(['ok', 'flag'])).default({}),
}).refine((d) => d.review !== null || d.result.length > 0) // an entry is a review or a result, never nothing
const entry = z.object({
  customer: str(120).default(''),
  files: z.array(str(200)).max(20).default([]),
  data,
})
const update = z.object({ data })

export type EntryData = z.infer<typeof data>

const COUNT_KEYS = ['full', 'config', 'custom', 'integ', 'none', 'verify'] as const
/**
 * What the list shows without opening an entry: requirements per status, and per status the optional ones (`o:full`…),
 * so the list can draw short bars for them and tell mandatory gaps apart. An entry waiting for its review has `review`: how many wait.
 */
const countsOf = (d: EntryData): Record<string, number> => {
  if (d.review) return { review: d.review.length }
  return Object.fromEntries(COUNT_KEYS.flatMap((k) => {
    const of = d.result.filter((r) => r.s === k)
    return [[k, of.length], [`o:${k}`, of.filter((r) => r.pri === 'O').length]]
  }))
}

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
