import type { SheetData } from 'write-excel-file/browser'
import { ORDER, STATUS } from '@/data/tor'
import type { Assessment } from '@/lib/assessment'
import type { FunctionCoverage } from '@/lib/types'
import { UNKNOWN, serviceLabel, zoneLabel, DEFAULT_TAXONOMY, type Taxonomy } from '@/data/taxonomy'

type Validation = 'ok' | 'flag'

const COVERAGE = { covered: 'TOR ตอบแล้ว', partial: 'ตอบบางส่วน', missing: 'TOR ไม่ได้พูดถึง' }
const VALIDATION = { ok: 'Confirmed by PM', flag: 'Flagged for review' }

const head = (cells: string[]) => cells.map((value) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#FEF6E6' }))
const wrapped = (v: string) => ({ value: v, wrap: true, alignVertical: 'top' as const })

/** Builds the workbook: matrix, open questions (if checked) and a status summary. */
export function buildSheets(a: Assessment, coverage: FunctionCoverage[] | null, valid: Record<string, Validation>, tx: Taxonomy = DEFAULT_TAXONOMY) {
  const sheets: { sheet: string; data: SheetData; columns: { width: number }[]; stickyRowsCount: number }[] = [
    {
      sheet: 'Compliance matrix',
      data: [
        head(['ID', 'Module', 'Zone', 'Service', 'ขอ API', 'Requirement', 'Status', 'Confidence', 'Agent reasoning', 'Evidence', 'Recommendation', 'PM validation']),
        ...a.reqs.map((r) =>
          [r.id, r.module, (r.targets ?? []).map((t) => zoneLabel(t.zone, tx)).join('\n'), (r.targets ?? []).map((t) => (t.service === UNKNOWN ? '-' : serviceLabel(t.service, tx))).join('\n'), r.wantsApi ? 'ขอ API · ถาม Tech' : '', r.text, STATUS[r.s].label, r.conf, r.reason, r.evidence, r.rec, valid[r.id] ? VALIDATION[valid[r.id]] : 'Not yet validated'].map(wrapped),
        ),
      ],
      columns: [9, 14, 24, 26, 16, 55, 24, 11, 50, 34, 45, 20].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
  ]
  if (coverage) {
    sheets.push({
      sheet: 'Open questions',
      data: [
        head(['Topic', 'Coverage', 'Requirements', 'Open question']),
        ...coverage.flatMap((c) => (c.open.length ? c.open : ['']).map((q) => [c.function, COVERAGE[c.coverage], c.reqIds.join(', '), q].map(wrapped))),
      ],
      columns: [26, 18, 24, 80].map((width) => ({ width })),
      stickyRowsCount: 1,
    })
  }
  sheets.push({
    sheet: 'Summary',
    data: [head(['Status', 'Count']), ...ORDER.map((k) => [wrapped(STATUS[k].label), { value: a.counts[k] }]), [wrapped('Total'), { value: a.total }]],
    columns: [28, 10].map((width) => ({ width })),
    stickyRowsCount: 1,
  })
  return sheets
}

export async function exportXlsx(a: Assessment, coverage: FunctionCoverage[] | null, valid: Record<string, Validation>, customer: string, tx: Taxonomy = DEFAULT_TAXONOMY) {
  const name = `${(customer || 'TOR').replace(/[^\p{L}\p{N}_-]+/gu, '_')}_compliance_${new Date().toISOString().slice(0, 10)}.xlsx`
  const writeXlsxFile = (await import('write-excel-file/browser')).default // loaded on first export only
  await writeXlsxFile(buildSheets(a, coverage, valid, tx)).toFile(name)
  return name
}
