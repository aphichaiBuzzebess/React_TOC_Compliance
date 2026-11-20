import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { DEFAULT_TAXONOMY, UNKNOWN, isService, isZone, type Taxonomy } from '../src/data/taxonomy.js'
import type { StatusKey } from '../src/lib/types.js'
import { HttpError } from './auth.js'
import { accountMode, getDb, type Db, type KbItem, type KbKind } from './db.js'
import { loadKb, type Note } from './kb.js'
import { DEFAULT_PROMPTS, PROMPT_KEYS, type PromptKey } from './prompts.js'

/** What the pipeline needs to run: notes, taxonomy and prompt texts, and where they came from. */
export interface Knowledge { notes: Note[]; taxonomy: Taxonomy; prompts: Record<PromptKey, string>; status: 'database' | 'defaults' }

export interface NoteData { title: string; module: string; service: string | null; zones: string[]; support: Exclude<StatusKey, 'verify'>; body: string }
export interface NoteView extends NoteData { path: string; updatedAt: string | null; updatedBy: string }

const SUPPORT = ['full', 'config', 'custom', 'integ', 'none'] as const
const SEEDED = 'seeded_at'
const TTL = 30_000
const MAX_PROMPT = 20_000

// ---- defaults (files + built-in) -------------------------------------------------------------

function fileNotes(): Note[] {
  try { return loadKb() } catch { return [] } // no kb/ folder: nothing to show, never a crash
}
const toData = (n: Note): NoteData => ({ title: n.title, module: n.module, service: n.service ?? null, zones: n.zone ?? [], support: n.support as NoteData['support'], body: n.body })
const defaults = (): Knowledge => ({ notes: fileNotes(), taxonomy: DEFAULT_TAXONOMY, prompts: { ...DEFAULT_PROMPTS }, status: 'defaults' })

// ---- validation ---------------------------------------------------------------------------------

const noteSchema = z.object({
  title: z.string().trim().min(1, 'ต้องมีชื่อ').max(120, 'ชื่อยาวเกิน 120 ตัวอักษร'),
  module: z.string().trim().max(60, 'module ยาวเกิน 60 ตัวอักษร').default(''),
  service: z.string().trim().nullable().optional().transform((v) => v || null),
  zones: z.array(z.string()).max(8).default([]),
  support: z.enum(SUPPORT),
  body: z.string().max(20_000, 'เนื้อหายาวเกิน 20,000 ตัวอักษร'),
})

const ID = /^[a-z0-9-]{2,40}$/
const text = (n: number) => z.string().trim().max(n)
const entry = {
  id: z.string().regex(ID, 'id ต้องเป็น a-z 0-9 - ยาว 2-40 ตัว').refine((v) => v !== UNKNOWN, `"${UNKNOWN}" เป็นค่าสงวน`),
  label: text(80).min(1, 'ต้องมีชื่อ'),
  hint: text(400).default(''),
  examples: z.array(text(200).min(1)).max(10).default([]),
  archived: z.boolean().default(false),
}
const taxonomySchema = z.object({
  zones: z.array(z.object(entry)).max(12, 'zone ได้ไม่เกิน 12'),
  services: z.array(z.object({ ...entry, confirmed: z.boolean().default(true) })).max(60, 'service ได้ไม่เกิน 60'),
})

const fail = (msg: string): never => { throw new HttpError(400, msg) }
const first = (e: z.ZodError) => e.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง'

/** A taxonomy an admin may save: ids are unique and never reused, none of the current ids disappears (archive instead). */
export function validateTaxonomy(raw: unknown, current: Taxonomy): Taxonomy {
  const r = taxonomySchema.safeParse(raw)
  if (!r.success) return fail(first(r.error))
  const tx = r.data as Taxonomy
  if (JSON.stringify(tx).length > 100_000) fail('taxonomy ใหญ่เกิน 100 KB')
  for (const [name, list, was] of [['zone', tx.zones, current.zones], ['service', tx.services, current.services]] as const) {
    const ids = list.map((x) => x.id)
    if (new Set(ids).size !== ids.length) fail(`${name} มี id ซ้ำ`)
    for (const old of was) if (!ids.includes(old.id)) fail(`ลบ ${name} "${old.id}" ไม่ได้ ให้ใช้ archive (เก็บเข้าคลัง) แทน`)
  }
  return tx
}

export function validateNote(raw: unknown, tx: Taxonomy): NoteData {
  const r = noteSchema.safeParse(raw)
  if (!r.success) return fail(first(r.error))
  const n = r.data
  if (n.service && !isService(n.service, tx)) fail(`ไม่รู้จัก service "${n.service}"`)
  for (const z of n.zones) if (!isZone(z, tx)) fail(`ไม่รู้จัก zone "${z}"`)
  const serviceLabel = tx.services.find((s) => s.id === n.service)?.label
  return { ...n, module: n.module || serviceLabel || '', service: n.service ?? null, zones: [...new Set(n.zones)] }
}

function validatePrompt(key: unknown, body: unknown): { key: PromptKey; body: string } {
  if (!PROMPT_KEYS.includes(key as PromptKey)) return fail('ไม่รู้จัก prompt นี้')
  if (typeof body !== 'string' || !body.trim()) return fail('prompt ต้องไม่ว่าง')
  if (body.length > MAX_PROMPT) return fail(`prompt ยาวเกิน ${MAX_PROMPT.toLocaleString()} ตัวอักษร`)
  return { key: key as PromptKey, body: body.trim() }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)

/** `<service-or-module>/<ascii-title>.md`, or `note-<hex>` when the title has no ASCII letters; unique among `taken`. */
export function makePath(n: NoteData, taken: Set<string>): string {
  const folder = slug(n.service ?? '') || slug(n.module) || 'general'
  const name = slug(n.title) || `note-${randomBytes(4).toString('hex')}`
  let path = `${folder}/${name}.md`
  for (let i = 2; taken.has(path); i++) path = `${folder}/${name}-${i}.md`
  return path
}

// ---- reading ------------------------------------------------------------------------------------

const day = (iso: string) => iso.slice(0, 10)
function toNote(path: string, d: NoteData, updatedAt: string): Note {
  return { path, title: d.title, module: d.module, support: d.support as StatusKey, updated: day(updatedAt), body: d.body, ...(d.service && { service: d.service }), ...(d.zones.length && { zone: d.zones }) }
}
const parseNote = (it: KbItem): NoteData | undefined => {
  const r = noteSchema.safeParse(it.data)
  return r.success ? { ...r.data, service: r.data.service ?? null } : undefined
}
const parseTaxonomy = (data: unknown): Taxonomy | undefined => {
  const r = taxonomySchema.safeParse(data)
  return r.success ? (r.data as Taxonomy) : undefined
}

interface Stored { notes: KbItem[]; taxonomy?: KbItem; prompts: KbItem[] }
/** Everything stored, read straight from the database. Null when the editable store is not set up (no tables, or never seeded). */
async function readStored(db: Db): Promise<Stored | null> {
  if (!(await db.getMeta(SEEDED))) return null
  const [notes, tax, prompts] = await Promise.all([db.kbList('note'), db.kbGet('taxonomy', 'taxonomy'), db.kbList('prompt')])
  return { notes, taxonomy: tax, prompts }
}

let cache: { at: number; value: Knowledge } | null = null
export const clearKnowledgeCache = () => { cache = null }

/** What a run uses. 30 s cache per instance. Never throws: a database problem means built-in defaults (status says so). */
export async function loadKnowledge(): Promise<Knowledge> {
  if (!accountMode()) return defaults()
  if (cache && Date.now() - cache.at < TTL) return cache.value
  try {
    const s = await readStored(await getDb())
    if (!s) return defaults()
    const tx = (s.taxonomy && parseTaxonomy(s.taxonomy.data)) || DEFAULT_TAXONOMY
    const prompts = { ...DEFAULT_PROMPTS }
    for (const p of s.prompts) {
      const body = (p.data as { body?: unknown } | null)?.body
      if (PROMPT_KEYS.includes(p.key as PromptKey) && typeof body === 'string' && body.trim()) prompts[p.key as PromptKey] = body
    }
    const notes: Note[] = []
    for (const it of s.notes) { const d = parseNote(it); if (d) notes.push(toNote(it.key, d, it.updatedAt)) }
    const value: Knowledge = { notes, taxonomy: tx, prompts, status: 'database' }
    cache = { at: Date.now(), value }
    return value
  } catch {
    return cache ? { ...cache.value, status: 'defaults' } : defaults()
  }
}

export interface PromptView { body: string; isDefault: boolean; defaultBody: string; updatedAt: string | null }
export interface KnowledgeView {
  status: 'database' | 'defaults'
  notes: NoteView[]
  taxonomy: Taxonomy
  taxonomyUpdatedAt: string | null
  prompts: Record<PromptKey, PromptView>
}

/** What the Knowledge page shows: always from the database (never the cache), with the tokens an editor sends back. */
export async function loadView(): Promise<KnowledgeView> {
  const fromDefaults = (): KnowledgeView => ({
    status: 'defaults',
    notes: fileNotes().map((n) => ({ ...toData(n), path: n.path, updatedAt: null, updatedBy: '' })),
    taxonomy: DEFAULT_TAXONOMY,
    taxonomyUpdatedAt: null,
    prompts: Object.fromEntries(PROMPT_KEYS.map((k) => [k, { body: DEFAULT_PROMPTS[k], isDefault: true, defaultBody: DEFAULT_PROMPTS[k], updatedAt: null }])) as Record<PromptKey, PromptView>,
  })
  if (!accountMode()) return fromDefaults()
  try {
    const s = await readStored(await getDb())
    if (!s) return fromDefaults()
    const notes: NoteView[] = []
    for (const it of s.notes) { const d = parseNote(it); if (d) notes.push({ ...d, path: it.key, updatedAt: it.updatedAt, updatedBy: it.updatedBy }) }
    const stored = new Map(s.prompts.map((p) => [p.key, p]))
    const prompts = Object.fromEntries(
      PROMPT_KEYS.map((k) => {
        const p = stored.get(k)
        const body = (p?.data as { body?: unknown } | undefined)?.body
        const has = typeof body === 'string' && body.trim() !== ''
        return [k, { body: has ? (body as string) : DEFAULT_PROMPTS[k], isDefault: !has, defaultBody: DEFAULT_PROMPTS[k], updatedAt: p?.updatedAt ?? null }]
      }),
    ) as Record<PromptKey, PromptView>
    return { status: 'database', notes, taxonomy: (s.taxonomy && parseTaxonomy(s.taxonomy.data)) || DEFAULT_TAXONOMY, taxonomyUpdatedAt: s.taxonomy?.updatedAt ?? null, prompts }
  } catch {
    return fromDefaults()
  }
}

// ---- writing (admin only: the API checks the role) ------------------------------------------------

/** Only a set-up store can be written. A missing table is reported as what it is. */
async function store(): Promise<Db> {
  if (!accountMode()) throw new HttpError(403, 'ต้องเปิดระบบบัญชีและเป็น admin')
  return getDb()
}
async function guarded<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await store()
  try {
    const out = await fn(db)
    clearKnowledgeCache()
    return out
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') throw new HttpError(503, 'ยังไม่ได้สร้างตาราง ให้รัน npm run db:init ก่อน')
    throw e
  }
}
const conflict = (): never => { throw new HttpError(409, 'มีคนบันทึกรายการนี้ไปก่อนแล้ว กดโหลดใหม่แล้วแก้อีกครั้ง') }
const ok = <T>(r: T | 'conflict'): T => (r === 'conflict' ? conflict() : r)
async function currentTaxonomy(db: Db): Promise<Taxonomy> {
  const it = await db.kbGet('taxonomy', 'taxonomy')
  return (it && parseTaxonomy(it.data)) || DEFAULT_TAXONOMY
}

/** New note (no `path`, `expected` null) or an edit of `path` with the token the editor loaded. */
export function saveNote(by: string, input: { path?: string; updatedAt?: string | null } & Record<string, unknown>) {
  return guarded(async (db) => {
    const data = validateNote(input, await currentTaxonomy(db))
    if (input.path === undefined) {
      const path = makePath(data, new Set((await db.kbList('note')).map((i) => i.key)))
      const it = ok(await db.kbPut('note', path, data, by, null))
      return { path, updatedAt: it.updatedAt }
    }
    if (!(await db.kbGet('note', input.path))) throw new HttpError(404, 'ไม่พบ note นี้')
    const it = ok(await db.kbPut('note', input.path, data, by, input.updatedAt ?? ''))
    return { path: input.path, updatedAt: it.updatedAt }
  })
}

export const removeNote = (by: string, path: string, updatedAt: string) =>
  guarded(async (db) => {
    const r = await db.kbDelete('note', path, by, updatedAt)
    if (r === false) throw new HttpError(404, 'ไม่พบ note นี้')
    ok(r)
    return { ok: true }
  })

export const saveTaxonomy = (by: string, raw: unknown, updatedAt: string | null) =>
  guarded(async (db) => {
    const tx = validateTaxonomy(raw, await currentTaxonomy(db))
    return { updatedAt: ok(await db.kbPut('taxonomy', 'taxonomy', tx, by, updatedAt)).updatedAt }
  })

export const savePrompt = (by: string, key: unknown, body: unknown, updatedAt: string | null) =>
  guarded(async (db) => {
    const p = validatePrompt(key, body)
    return { updatedAt: ok(await db.kbPut('prompt', p.key, { body: p.body }, by, updatedAt)).updatedAt }
  })

/** Back to the built-in text: the row is removed (its content stays as a version). */
export const resetPrompt = (by: string, key: unknown, updatedAt: string) =>
  guarded(async (db) => {
    if (!PROMPT_KEYS.includes(key as PromptKey)) return fail('ไม่รู้จัก prompt นี้')
    const r = await db.kbDelete('prompt', key as string, by, updatedAt)
    if (r !== false) ok(r)
    return { ok: true }
  })

/** Put an old version back as a new save. A taxonomy never loses ids: ids newer than the version return archived. */
export const restoreVersion = (by: string, versionId: number, updatedAt: string | null) =>
  guarded(async (db) => {
    const v = await db.kbVersion(versionId)
    if (!v) throw new HttpError(404, 'ไม่พบเวอร์ชันนี้')
    const kind: KbKind = v.kind
    if (kind === 'prompt') {
      const p = validatePrompt(v.key, (v.data as { body?: unknown }).body)
      return { kind, key: p.key, updatedAt: ok(await db.kbPut('prompt', p.key, { body: p.body }, by, updatedAt)).updatedAt }
    }
    if (kind === 'note') {
      const data = validateNote(v.data, await currentTaxonomy(db))
      return { kind, key: v.key, updatedAt: ok(await db.kbPut('note', v.key, data, by, updatedAt)).updatedAt }
    }
    const now = await currentTaxonomy(db)
    const old = parseTaxonomy(v.data)
    if (!old) return fail('เวอร์ชันนี้เปิดไม่ได้')
    const keepZones = now.zones.filter((z) => !old!.zones.some((o) => o.id === z.id)).map((z) => ({ ...z, archived: true }))
    const keepServices = now.services.filter((s) => !old!.services.some((o) => o.id === s.id)).map((s) => ({ ...s, archived: true }))
    const merged = validateTaxonomy({ zones: [...old.zones, ...keepZones], services: [...old.services, ...keepServices] }, now)
    return { kind, key: 'taxonomy', updatedAt: ok(await db.kbPut('taxonomy', 'taxonomy', merged, by, updatedAt)).updatedAt }
  })

/** Add the notes of the kb/ files that have no live row and no history, then mark the store as seeded. Never overwrites. */
export async function seedFromFiles(db: Db, by: string) {
  const files = fileNotes()
  const added = await db.kbSeed('note', files.map((n) => ({ key: n.path, data: toData(n) })), by)
  await db.setMeta(SEEDED, new Date().toISOString())
  return { added, skipped: files.length - added }
}
export const importFromFiles = (by: string) => guarded((db) => seedFromFiles(db, by))

export async function listVersions(kind: KbKind, key: string) {
  return (await store().then((db) => db.kbVersions(kind, key))).map((v) => ({ id: v.id, at: v.at, by: v.by, data: v.data }))
}
export async function listDeleted() {
  return (await store()).kbDeletedKeys('note')
}
