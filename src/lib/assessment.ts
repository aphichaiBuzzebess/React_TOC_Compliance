import { GAPS, MODULES, ORDER, REQS, STATUS, TOTAL } from '@/data/tor'
import type { Req, StatusKey } from '@/lib/types'

export interface Gap { ids: string; s: StatusKey; title: string; gap: string; rec: string }

/** Everything the result pages show, derived from one list of requirements. */
export interface Assessment {
  sample: boolean
  total: number
  counts: Record<StatusKey, number>
  modules: [name: string, total: number, full: number][]
  reqs: Req[]
  gaps: Gap[]
}

const GAP_STATUS: StatusKey[] = ['custom', 'integ', 'none']

export function fromReqs(reqs: Req[]): Assessment {
  const counts = Object.fromEntries(ORDER.map((k) => [k, reqs.filter((r) => r.s === k).length])) as Record<StatusKey, number>
  const mods = new Map<string, [number, number]>()
  for (const r of reqs) {
    const [t, f] = mods.get(r.module) ?? [0, 0]
    mods.set(r.module, [t + 1, f + (r.s === 'full' ? 1 : 0)])
  }
  return {
    sample: false,
    total: reqs.length,
    counts,
    modules: [...mods].map(([m, [t, f]]) => [m, t, f] as [string, number, number]),
    reqs,
    gaps: reqs.filter((r) => GAP_STATUS.includes(r.s)).map((r) => ({ ids: r.id, s: r.s, title: r.text, gap: r.reason, rec: r.rec })),
  }
}

export const SAMPLE: Assessment = {
  sample: true,
  total: TOTAL,
  counts: Object.fromEntries(ORDER.map((k) => [k, STATUS[k].count])) as Record<StatusKey, number>,
  modules: MODULES,
  reqs: REQS,
  gaps: GAPS,
}

export const fit = (a: Assessment) => a.counts.full + a.counts.config
export const gapCount = (a: Assessment) => a.counts.custom + a.counts.integ + a.counts.none
