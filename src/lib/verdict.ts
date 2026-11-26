import type { Req, StatusKey } from '@/lib/types'

/**
 * Where a TOR stands, from the counts alone.
 *  - "รองรับได้ %" = every requirement the product can do (as is, with setup, development or integration) over the ones that
 *    could be judged; "ต้องตรวจสอบ" is left out of both, as are contract terms (they are never in the result).
 *  - A mandatory requirement that is not supported is what decides a bid, so the verdict counts those.
 */
export type VerdictKey = 'GO' | 'COND' | 'HIGH'

export const VERDICT: Record<VerdictKey, { label: string; rule: string; act: string; tone: string }> = {
  GO: { label: 'ยื่นได้', rule: 'ข้อบังคับรองรับได้ทุกข้อ และรองรับได้ตั้งแต่ 85%', act: 'เตรียมข้อเสนอได้เลย', tone: 'var(--st-full-dot)' },
  COND: { label: 'ยื่นได้ แต่มีเงื่อนไข', rule: 'ไม่เข้าเกณฑ์ "ยื่นได้" และไม่ถึงเกณฑ์ "เสี่ยงสูง"', act: 'ตกลงข้อที่ขาดกับลูกค้าก่อนยื่น', tone: 'var(--color-amber)' },
  HIGH: { label: 'เสี่ยงสูง', rule: 'ข้อบังคับไม่รองรับตั้งแต่ 3 ข้อ หรือรองรับได้ต่ำกว่า 60%', act: 'คุยขอบเขตกับลูกค้าก่อนตัดสินใจยื่น', tone: 'var(--st-none-dot)' },
}
export const VERDICT_ORDER: VerdictKey[] = ['GO', 'COND', 'HIGH']

export interface Score {
  total: number
  by: Record<StatusKey, number>
  /** ready = as is; work = setup, development or integration; no = not supported; check = cannot be judged yet */
  g: { ready: number; work: number; no: number; check: number }
  evaluable: number
  okN: number
  cov: number
  ready: number
  mandTotal: number
  mandPass: number
  /** mandatory requirements that are not supported: the deal breakers */
  mandNo: number
  verdict: VerdictKey
}

const KEYS: StatusKey[] = ['full', 'config', 'custom', 'integ', 'none', 'verify']

/** From per-status counts, with the optional ones per status under `o:<status>` (history list rows carry exactly this). */
export function scoreCounts(c: Record<string, number>): Score {
  const by = Object.fromEntries(KEYS.map((k) => [k, c[k] ?? 0])) as Record<StatusKey, number>
  const opt = (k: StatusKey) => c[`o:${k}`] ?? 0
  const total = KEYS.reduce((n, k) => n + by[k], 0)
  const g = { ready: by.full, work: by.config + by.custom + by.integ, no: by.none, check: by.verify }
  const evaluable = total - by.verify
  const okN = g.ready + g.work
  const cov = evaluable ? Math.round((okN * 100) / evaluable) : 0
  const ready = evaluable ? Math.round((by.full * 100) / evaluable) : 0
  const mandTotal = KEYS.filter((k) => k !== 'verify').reduce((n, k) => n + by[k] - opt(k), 0)
  const mandNo = by.none - opt('none')
  const verdict: VerdictKey = mandNo >= 3 || cov < 60 ? 'HIGH' : mandNo === 0 && cov >= 85 ? 'GO' : 'COND'
  return { total, by, g, evaluable, okN, cov, ready, mandTotal, mandPass: mandTotal - mandNo, mandNo, verdict }
}

/** The same counts from a list of judged requirements. A requirement with no priority (saved before priorities) counts as mandatory. */
export function countsOf(reqs: Pick<Req, 's' | 'pri'>[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const r of reqs) {
    c[r.s] = (c[r.s] ?? 0) + 1
    if (r.pri === 'O') c[`o:${r.s}`] = (c[`o:${r.s}`] ?? 0) + 1
  }
  return c
}
export const score = (reqs: Pick<Req, 's' | 'pri'>[]) => scoreCounts(countsOf(reqs))

/** Why this verdict, in one line, and what to do next. */
export function why(s: Score): { why: string; act: string } {
  const parts: string[] = []
  if (s.verdict === 'GO') parts.push(`ข้อบังคับรองรับได้ทุกข้อ และรองรับได้ ${s.cov}%`)
  else {
    if (s.mandNo) parts.push(`ข้อบังคับไม่รองรับ ${s.mandNo} ข้อ`)
    if (s.verdict === 'HIGH' && s.cov < 60) parts.push(`รองรับได้แค่ ${s.cov}%`)
    if (s.verdict === 'COND' && !s.mandNo) parts.push(`รองรับได้ ${s.cov}% ยังไม่ถึง 85%`)
  }
  return { why: `เพราะ${parts.join(' และ')}`, act: VERDICT[s.verdict].act }
}

/** The headline next to the big number. */
export function headline(s: Score): string {
  if (s.verdict === 'GO') return 'ข้อบังคับรองรับได้ทั้งหมด เตรียมข้อเสนอได้เลย'
  if (!s.mandNo) return 'ข้อบังคับรองรับได้ทั้งหมด แต่ยังมีงานพัฒนาหรือเชื่อมระบบที่ต้องประเมินก่อนยื่น'
  if (s.verdict === 'HIGH') return `มีข้อบังคับ ${s.mandNo} ข้อที่ยังไม่รองรับ ควรคุยขอบเขตกับลูกค้าก่อนตัดสินใจยื่น`
  return `มีข้อบังคับ ${s.mandNo} ข้อที่ยังไม่รองรับ ต้องตกลงขอบเขตกับลูกค้าก่อนยื่น`
}

/** Status groups, lightest first, as the strip and the filters show them. */
export const GROUPS: { k: keyof Score['g']; label: string; desc: string; keys: StatusKey[] }[] = [
  { k: 'ready', label: 'พร้อมใช้', desc: 'มีใน product แล้ว ใช้ได้ทันที', keys: ['full'] },
  { k: 'work', label: 'มีงานเพิ่ม', desc: 'ทำได้ แต่ต้องตั้งค่า พัฒนา หรือเชื่อมระบบ', keys: ['config', 'custom', 'integ'] },
  { k: 'no', label: 'ไม่รองรับ', desc: 'product ยังไม่มี', keys: ['none'] },
  { k: 'check', label: 'ต้องตรวจสอบ', desc: 'ข้อมูลยังไม่พอจะตัดสิน', keys: ['verify'] },
]
export const groupOf = (s: StatusKey) => GROUPS.find((g) => g.keys.includes(s))!.k

/** Lightest status first, mandatory before optional within a status. */
export const SEVERITY: StatusKey[] = ['full', 'config', 'custom', 'integ', 'none', 'verify']
export const bySeverity = <T extends Pick<Req, 's' | 'pri'>>(rows: T[]) =>
  rows.slice().sort((a, b) => SEVERITY.indexOf(a.s) - SEVERITY.indexOf(b.s) || Number(a.pri === 'O') - Number(b.pri === 'O'))
