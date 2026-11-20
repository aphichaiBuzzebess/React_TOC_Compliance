export type StatusKey = 'full' | 'config' | 'custom' | 'integ' | 'none' | 'verify'

import type { Target } from '../data/taxonomy.js'
export type { Target }

export interface Req {
  id: string
  module: string
  /** Where the requirement lands in the Buzzebees taxonomy. Absent on results saved before zones existed. */
  targets?: Target[]
  /** The customer builds their own system and asks for an API: never auto-judged, a person verifies with Tech. */
  wantsApi?: boolean
  s: StatusKey
  conf: string
  text: string
  reason: string
  evidence: string
  rec: string
}

/** A requirement as extracted from the TOR, before it is judged against the KB. */
export type RawReq = Pick<Req, 'id' | 'module' | 'text' | 'targets' | 'wantsApi'>

/** What the judge returns per requirement. */
export type Verdict = Pick<Req, 'id' | 's' | 'reason' | 'rec'> & { confidence: number; sources: string[] }

/** How well the TOR answers one Basic Question topic, and what is still unanswered. */
export interface FunctionCoverage {
  function: string
  coverage: 'covered' | 'partial' | 'missing'
  reqIds: string[]
  open: string[] // question texts still to ask the customer
}

export interface PingResult { ok: boolean; ms: number; error?: string }
