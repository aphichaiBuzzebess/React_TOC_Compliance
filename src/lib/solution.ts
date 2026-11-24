import { CUSTOM_BUILD, UNKNOWN, serviceLabel, zoneLabel, type Taxonomy } from '@/data/taxonomy'
import type { Req, StatusKey } from '@/lib/types'

export type Counts = Record<StatusKey, number>
export interface Line { service: string; label: string; kind: 'tool' | 'build' | 'unknown'; total: number; byStatus: Counts }
export interface ZoneBlock { zone: string; label: string; total: number; byStatus: Counts; lines: Line[] }
/** What the TOR needs, rolled up: per zone the Buzzebees tools it uses, and the tools of the whole project. */
export interface Solution { total: number; zones: ZoneBlock[]; tools: Line[]; build: number; api: number; untagged: number }

const zero = (): Counts => ({ full: 0, config: 0, custom: 0, integ: 0, none: 0, verify: 0 })

/** A requirement counts once in each zone and each service it lands in; the status of the requirement is the status of that count. */
export function buildSolution(reqs: Req[], tx: Taxonomy): Solution {
  type Z = { reqs: Req[]; lines: Map<string, Req[]> }
  const zones = new Map<string, Z>()
  const tools = new Map<string, Req[]>()
  const build = new Set<string>()
  let untagged = 0

  for (const r of reqs) {
    if (!r.targets?.length) { untagged++; continue }
    for (const t of r.targets) {
      const z: Z = zones.get(t.zone) ?? { reqs: [], lines: new Map() }
      if (!z.reqs.includes(r)) z.reqs.push(r)
      const l = z.lines.get(t.service) ?? []
      if (!l.includes(r)) l.push(r)
      z.lines.set(t.service, l)
      zones.set(t.zone, z)
      if (t.service === CUSTOM_BUILD) build.add(r.id)
      else if (t.service !== UNKNOWN) {
        const all = tools.get(t.service) ?? []
        if (!all.includes(r)) all.push(r)
        tools.set(t.service, all)
      }
    }
  }

  const count = (rs: Req[]): Counts => { const c = zero(); for (const r of rs) c[r.s]++; return c }
  const kind = (s: string): Line['kind'] => (s === CUSTOM_BUILD ? 'build' : s === UNKNOWN ? 'unknown' : 'tool')
  const line = (service: string, rs: Req[]): Line => ({ service, label: service === UNKNOWN ? 'ยังไม่ระบุ tool' : serviceLabel(service, tx), kind: kind(service), total: rs.length, byStatus: count(rs) })
  const rank = (l: Line) => (l.kind === 'tool' ? 0 : l.kind === 'build' ? 1 : 2)

  const order = [...tx.zones.map((z) => z.id), ...[...zones.keys()].filter((id) => !tx.zones.some((z) => z.id === id))]
  const blocks: ZoneBlock[] = order
    .filter((id) => zones.has(id))
    .map((id) => {
      const z = zones.get(id)!
      return {
        zone: id,
        label: id === UNKNOWN ? 'ยังไม่ระบุ solution type' : zoneLabel(id, tx),
        total: z.reqs.length,
        byStatus: count(z.reqs),
        lines: [...z.lines].map(([s, rs]) => line(s, rs)).sort((a, b) => rank(a) - rank(b) || b.total - a.total),
      }
    })
    .sort((a, b) => Number(a.zone === UNKNOWN) - Number(b.zone === UNKNOWN))

  return {
    total: reqs.length,
    zones: blocks,
    tools: [...tools].map(([s, rs]) => line(s, rs)).sort((a, b) => b.total - a.total),
    build: build.size,
    api: reqs.filter((r) => r.wantsApi).length,
    untagged,
  }
}
