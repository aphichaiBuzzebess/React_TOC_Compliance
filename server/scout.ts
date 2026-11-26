import type { EntryData } from './history.js'

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
