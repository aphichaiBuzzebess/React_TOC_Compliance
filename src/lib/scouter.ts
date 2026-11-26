import type { Evidence, ScoutItem, ScoutStatus, ScoutType } from '../../server/scout'

/** A gap as the Scouter API sends it (who saved the TOR is not sent). */
export type ScoutGap = Omit<Evidence, 'ownerId'>
export type { ScoutItem, ScoutStatus, ScoutType }

export const TYPE_LABEL: Record<ScoutType, string> = { NEW_FEATURE: 'ฟีเจอร์ใหม่', ENHANCEMENT: 'ปรับปรุงฟีเจอร์', INTEGRATION: 'เชื่อมระบบ' }
export const STATUS_LABEL: Record<ScoutStatus, string> = { new: 'ยังไม่ได้ดู', reviewing: 'กำลังพิจารณา', planned: 'อยู่ใน roadmap', in_dev: 'กำลังพัฒนา', released: 'ปล่อยแล้ว', rejected: 'ตัดสินใจไม่ทำ' }

/** What a need is worth, from its gaps. Only gaps a PM confirmed count; `pending` is how many more wait for that. */
export interface NeedStats {
  /** TORs that asked for it */
  tors: number
  customers: number
  /** TORs where it was mandatory */
  mand: number
  /** the deal value of those TORs, each TOR once */
  deal: number
  /** the deal value of TORs lost because the product lacked it */
  lost: number
  /** when it was last asked for (ISO), '' when never */
  last: string
  pending: number
}

export function needStats(gaps: ScoutGap[]): NeedStats {
  const ok = gaps.filter((g) => g.confirmed)
  const byTor = new Map<string, ScoutGap[]>()
  for (const g of ok) byTor.set(g.assessmentId, [...(byTor.get(g.assessmentId) ?? []), g])
  const tors = [...byTor.values()]
  return {
    tors: tors.length,
    customers: new Set(ok.map((g) => g.customer || g.assessmentId)).size,
    mand: tors.filter((t) => t.some((g) => g.mandatory)).length,
    deal: tors.reduce((n, t) => n + (t[0].deal ?? 0), 0),
    lost: tors.filter((t) => t.some((g) => g.lostBecause)).reduce((n, t) => n + (t[0].deal ?? 0), 0),
    last: ok.reduce((m, g) => (g.createdAt > m ? g.createdAt : m), ''),
    pending: gaps.length - ok.length,
  }
}

export type SortKey = 'tors' | 'customers' | 'deal' | 'lost' | 'last'
export const SORTS: [SortKey, string][] = [['tors', 'ถูกขอบ่อยที่สุด'], ['customers', 'จำนวนลูกค้า'], ['deal', 'มูลค่าดีลรวม'], ['lost', 'มูลค่าดีลที่แพ้'], ['last', 'ขอล่าสุด']]

/** Most first by the chosen number; a tie goes to the one asked for in more TORs. */
export const bySort = (key: SortKey) => (a: NeedStats, b: NeedStats) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : b.tors - a.tors)

/** 2.8 ล้าน, 900,000 บาท, – */
export const money = (v: number | null | undefined) => (!v ? '–' : v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, '')} ล้าน` : `${v.toLocaleString('th-TH')} บาท`)
