export type StatusKey = 'full' | 'config' | 'custom' | 'integ' | 'none' | 'verify'

import type { Target } from '../data/taxonomy.js'
export type { Target }

/** M = the TOR says it must (ต้อง), O = it says should or may (ควร). Absent on results saved before priorities existed: read as M. */
export type Priority = 'M' | 'O'

export interface Req {
  id: string
  module: string
  pri?: Priority
  /** The clause number in the TOR, e.g. "ข้อ 3.5.1". */
  ref?: string
  /** The TOR's own wording, when `text` shortened or reworded it. */
  orig?: string
  /** What is unclear or not measurable in the requirement as written. */
  amb?: string
  /** Where the requirement lands in the Buzzebees taxonomy. Absent on results saved before solutions existed. */
  targets?: Target[]
  /** The customer builds their own system and asks for an API: never auto-judged, a person verifies with Tech. */
  wantsApi?: boolean
  s: StatusKey
  conf: string
  text: string
  reason: string
  evidence: string
  rec: string
  /** What the product lacks for this requirement (empty when it is fully supported). */
  gap?: string
  /** A question for the customer whose answer would change the verdict. */
  q?: string
  /** A person changed the status: what the AI said, and why it was changed. */
  override?: { from: StatusKey; note: string }
}

/** A requirement as extracted from the TOR, before it is judged against the KB. */
export type RawReq = Pick<Req, 'id' | 'module' | 'text' | 'targets' | 'wantsApi' | 'pri' | 'ref' | 'orig' | 'amb'> & {
  /** The TOR did not say must or should: the priority is the AI's guess. */
  inf?: boolean
  /** A person has looked at it in the review (edited it or saved it as is). */
  seen?: boolean
}

/** A contract or bidder term from the TOR: not judged, ticked off by the BD once checked. */
export interface Term { id: string; text: string; ref?: string; ok?: boolean }

/** What the judge returns per requirement. */
export type Verdict = Pick<Req, 'id' | 's' | 'reason' | 'rec'> & { confidence: number; sources: string[]; gap?: string; q?: string }

/** How well the TOR answers one Basic Question topic, and what is still unanswered. */
export interface FunctionCoverage {
  function: string
  coverage: 'covered' | 'partial' | 'missing'
  reqIds: string[]
  open: string[] // question texts still to ask the customer
}

export interface PingResult { ok: boolean; ms: number; error?: string }
