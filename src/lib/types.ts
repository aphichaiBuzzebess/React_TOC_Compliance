export type StatusKey = 'full' | 'config' | 'custom' | 'integ' | 'none' | 'verify'

export interface Req {
  id: string
  module: string
  s: StatusKey
  conf: string
  text: string
  reason: string
  evidence: string
  rec: string
}

/** A requirement as extracted from the TOR, before it is judged against the KB. */
export type RawReq = Pick<Req, 'id' | 'module' | 'text'>

/** What the judge returns per requirement. */
export type Verdict = Pick<Req, 'id' | 's' | 'reason' | 'rec'> & { confidence: number; sources: string[] }
