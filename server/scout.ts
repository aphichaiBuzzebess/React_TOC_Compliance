import type { EntryData } from './history.js'
import type { Db } from './db.js'
import type { Llm } from './llm.js'
import { THAI_STYLE, UNTRUSTED } from './prompts.js'

/**
 * Feature Scouter, data side. Every saved TOR leaves a copy of its gaps here (what the customer asked for that the product
 * cannot do as is), so the team can see across all TORs what is asked for most. The copy is kept apart from history: a TOR
 * that drops out of someone's newest 50 still counts; one its owner deletes does not.
 */

/** The statuses that make a requirement a gap: not supported, needs development, needs integration. */
export const GAP_STATUSES = ['none', 'custom', 'integ'] as const
export type GapStatus = (typeof GAP_STATUSES)[number]

/** One requirement of one TOR that the product cannot do as is: what the Scouter counts. */
export interface EvidenceInput {
  reqId: string
  module: string
  text: string
  gap: string
  s: GapStatus
  mandatory: boolean
  /** A PM confirmed the result: only these are counted. */
  confirmed: boolean
  tor: string
  customer: string
  industry: string
  deal: number | null
  due: string
}

export type DealResult = 'open' | 'won' | 'lost'
export interface Evidence extends EvidenceInput {
  assessmentId: string
  ownerId: string | null
  /** The need it was grouped into; null until it is grouped. */
  itemId: string | null
  dealResult: DealResult
  /** The deal was lost because the product lacked this. */
  lostBecause: boolean
  createdAt: string
  updatedAt: string
}

export type ScoutType = 'NEW_FEATURE' | 'ENHANCEMENT' | 'INTEGRATION'
export type ScoutStatus = 'new' | 'reviewing' | 'planned' | 'in_dev' | 'released' | 'rejected'
/** A need, grouped from the gaps of many TORs, e.g. "Branch-level dashboard filter". */
export interface ScoutItem { id: string; title: string; need: string; type: ScoutType; module: string; status: ScoutStatus; editedBy: string; createdAt: string; updatedAt: string }
export type ScoutItemFields = Pick<ScoutItem, 'title' | 'need' | 'type' | 'module'>
/** One gap: a requirement of one TOR. */
export interface GapKey { assessmentId: string; reqId: string }
export const SCOUT_TYPES: ScoutType[] = ['NEW_FEATURE', 'ENHANCEMENT', 'INTEGRATION']
export const SCOUT_STATUSES: ScoutStatus[] = ['new', 'reviewing', 'planned', 'in_dev', 'released', 'rejected']
/** "SC-0007" from 7. */
export const scoutId = (n: number) => `SC-${String(n).padStart(4, '0')}`
export const scoutNo = (id: string) => Number(id.replace(/\D/g, '')) || 0

const industryOf = (m: { industry?: string; sub?: string; leaf?: string } | undefined) =>
  [m?.industry, m?.sub, m?.leaf].filter((x, i, xs): x is string => !!x && x !== xs[i - 1]).join(' › ')

/**
 * The gaps of a saved TOR, as the Scouter keeps them. A TOR still waiting for its review has none yet. A status a person
 * changed counts as changed; a flagged result is not confirmed.
 */
export function evidenceOf(data: EntryData, customer: string): EvidenceInput[] {
  if (data.review) return []
  const m = data.meta
  return data.result
    .filter((r): r is typeof r & { s: GapStatus } => (GAP_STATUSES as readonly string[]).includes(r.s))
    .map((r) => ({
      reqId: r.id,
      module: r.module,
      text: r.text,
      gap: r.gap || r.reason,
      s: r.s,
      mandatory: r.pri !== 'O',
      confirmed: data.valid[r.id] === 'ok',
      tor: m?.title || customer || 'TOR',
      customer,
      industry: industryOf(m),
      deal: m?.value ?? null,
      due: m?.due ?? '',
    }))
}

// ---- grouping gaps into needs (AI) ----------------------------------------------------------------

const GROUP_SYSTEM =
  'You keep the list of product needs that customers asked for in TORs and our product cannot meet yet. ' +
  'For each new gap, decide whether it is the same need as one already on the list (the same capability, even when worded differently, ' +
  'e.g. "Dashboard กรองตามสาขา" and "รายงานรายสาขา") and give that id, or that it is a new need. New gaps that are the same need as each other share one new need. ' +
  'Do not group different capabilities only because they share a category. A new need gets a short title naming the capability (at most 60 characters), ' +
  'a one-sentence need saying what customers want, a type (NEW_FEATURE when the product has nothing for it, ENHANCEMENT when an existing feature must do more, ' +
  'INTEGRATION when it is about connecting another system) and the category of its gaps.'

const GROUP_TOOL = {
  name: 'report_groups',
  description: 'Say which need each new gap belongs to, and describe the new needs.',
  schema: {
    type: 'object',
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            gap: { type: 'string', description: 'The gap reference, e.g. g3' },
            need: { type: 'string', description: 'An existing need id (SC-0001) or the ref of a new need (N1)' },
          },
          required: ['gap', 'need'],
        },
      },
      newNeeds: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: 'N1, N2…' },
            title: { type: 'string' },
            need: { type: 'string' },
            type: { type: 'string', enum: SCOUT_TYPES },
            module: { type: 'string' },
          },
          required: ['ref', 'title', 'need', 'type', 'module'],
        },
      },
    },
    required: ['assignments', 'newNeeds'],
  },
}

const TYPE_OF: Record<GapStatus, ScoutType> = { none: 'NEW_FEATURE', custom: 'ENHANCEMENT', integ: 'INTEGRATION' }
const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

export interface Grouping {
  /** existing need id -> its new gaps */
  join: Map<string, GapKey[]>
  /** new needs, each with the gaps that start it */
  create: { fields: ScoutItemFields; gaps: GapKey[] }[]
}

/** One AI call: the given gaps sorted into the needs we have, or new ones. Anything the model gets wrong leaves that gap ungrouped. */
export async function groupGaps(llm: Llm, items: Pick<ScoutItem, 'id' | 'title' | 'need' | 'type' | 'module'>[], gaps: Evidence[]): Promise<Grouping> {
  const ref = new Map(gaps.map((g, i) => [`g${i + 1}`, g]))
  const out = await llm<{ assignments?: { gap?: unknown; need?: unknown }[]; newNeeds?: { ref?: unknown; title?: unknown; need?: unknown; type?: unknown; module?: unknown }[] }>({
    system: `${GROUP_SYSTEM} ${THAI_STYLE} ${UNTRUSTED}`,
    content: [{
      type: 'text',
      text: [
        'Needs already on the list:',
        ...(items.length ? items.map((x) => `- ${x.id} [${x.type}, ${x.module}] ${x.title}: ${x.need}`) : ['(none yet)']),
        '',
        'New gaps:',
        ...[...ref].map(([k, g]) => `- ${k} [${g.module}] ${g.text} (ขาด: ${g.gap})`),
      ].join('\n'),
    }],
    tool: GROUP_TOOL,
    maxTokens: 4000,
  })
  const known = new Set(items.map((x) => x.id))
  const fresh = new Map<string, Omit<ScoutItemFields, 'type'> & { type?: ScoutType }>()
  for (const n of out?.newNeeds ?? []) {
    const r = cut(n.ref, 10)
    const title = cut(n.title, 80)
    if (!r || !title || fresh.has(r)) continue
    fresh.set(r, { title, need: cut(n.need, 300), type: SCOUT_TYPES.includes(n.type as ScoutType) ? (n.type as ScoutType) : undefined, module: cut(n.module, 80) })
  }
  const join = new Map<string, GapKey[]>()
  const toNew = new Map<string, GapKey[]>()
  const seen = new Set<string>()
  for (const a of out?.assignments ?? []) {
    const g = ref.get(cut(a.gap, 10))
    const target = cut(a.need, 20)
    if (!g || seen.has(cut(a.gap, 10))) continue
    const key = { assessmentId: g.assessmentId, reqId: g.reqId }
    if (known.has(target)) { seen.add(cut(a.gap, 10)); join.set(target, [...(join.get(target) ?? []), key]) }
    else if (fresh.has(target)) { seen.add(cut(a.gap, 10)); toNew.set(target, [...(toNew.get(target) ?? []), key]) }
  }
  const create = [...toNew].map(([r, keys]) => {
    const f = fresh.get(r)!
    const first = gaps.find((g) => g.assessmentId === keys[0].assessmentId && g.reqId === keys[0].reqId)
    // No valid type or category from the model: take them from the first gap (not supported = new feature, development = enhancement).
    return { fields: { ...f, type: f.type ?? (first ? TYPE_OF[first.s] : 'NEW_FEATURE'), module: f.module || first?.module || '' }, gaps: keys }
  })
  return { join, create }
}

export const GROUP_BATCH = 20
/** Gaps per request: two AI calls stay well inside a function's time limit; the rest wait for the next run. */
export const GROUP_MAX = 40

/** Group the ungrouped gaps, oldest first, a batch at a time; needs made by one batch are offered to the next. */
export async function runGrouping(db: Db, llm: Llm, by = 'AI'): Promise<{ grouped: number; created: number; left: number }> {
  const todo = (await db.scoutEvidence()).filter((e) => !e.itemId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const items = await db.scoutItems()
  let grouped = 0
  let created = 0
  const now = todo.slice(0, GROUP_MAX)
  for (let i = 0; i < now.length; i += GROUP_BATCH) {
    const g = await groupGaps(llm, items, now.slice(i, i + GROUP_BATCH))
    for (const [id, keys] of g.join) grouped += await db.scoutAssign(keys, id)
    for (const c of g.create) {
      items.push(await db.scoutCreateItem(c.fields, by, c.gaps))
      created++
      grouped += c.gaps.length
    }
  }
  return { grouped, created, left: todo.length - grouped }
}
