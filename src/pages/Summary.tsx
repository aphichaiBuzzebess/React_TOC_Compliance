import { useMemo, useRef, useState } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { ORDER, STATUS, pct } from '@/data/tor'
import { fit, gapCount } from '@/lib/assessment'
import { useAssessment } from '@/lib/useAssessment'
import { exportPdf } from '@/lib/exportPdf'
import { buildSolution, type Counts, type Line } from '@/lib/solution'
import type { Assessment } from '@/lib/assessment'
import { Alert, Button, PageHeader, EmptyState, metaLabel } from '@/components/ui'

const SHORT: Record<keyof Counts, string> = { full: 'ทำได้เลย', config: 'ตั้งค่า', custom: 'พัฒนาเพิ่ม', integ: 'เชื่อมต่อ', none: 'ไม่รองรับ', verify: 'รอยืนยัน' }

/** Status counts as small dots with a number: only the statuses that occur. */
function Breakdown({ by }: { by: Counts }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {ORDER.filter((k) => by[k] > 0).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS[k].dot }} />
          {SHORT[k]} {by[k]}
        </span>
      ))}
    </span>
  )
}

function ToolRow({ l }: { l: Line }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className={l.kind === 'tool' ? 'text-ink' : 'text-muted'}>
        {l.label} <span className="text-muted">· {l.total} ข้อ</span>
      </span>
      <Breakdown by={l.byStatus} />
    </li>
  )
}

function SummaryContent({ a }: { a: Assessment }) {
  const confirmed = useAssessmentStore((s) => Object.values(s.valid).filter((v) => v === 'ok').length)
  const customer = useAssessmentStore((s) => s.customer)
  const taxonomy = useAssessmentStore((s) => s.taxonomy)
  const sol = useMemo(() => buildSolution(a.reqs, taxonomy), [a.reqs, taxonomy])
  const page = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  async function download() {
    if (!page.current) return
    setBusy(true)
    setError(null)
    try {
      await exportPdf(page.current, `${(customer || 'TOR').replace(/[^\p{L}\p{N}_-]+/gu, '_')}_executive_summary_${today}.pdf`)
    } catch {
      setError('สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }
  const stats = [
    { label: 'Product fit', value: pct(fit(a), a.total), note: 'Supported out of the box or by configuration' },
    { label: 'Gaps', value: String(gapCount(a)), note: 'Customization, integration, not supported' },
    { label: 'Need verification', value: String(a.counts.verify), note: 'Confirm with product team' },
  ]
  const strongest = [...a.modules].filter((m) => m[2] > 0).sort((x, y) => y[2] / y[1] - x[2] / x[1]).slice(0, 3).map((m) => m[0]).join(', ')
  return (
    <>
      <PageHeader title="Executive summary" lead="สรุปสำหรับผู้บริหารจากผลประเมินล่าสุด ดาวน์โหลดเป็น PDF ได้" action={<Button disabled={busy} onClick={download}>{busy ? 'กำลังสร้าง PDF…' : 'Download PDF'}</Button>} />
      {error && <p role="alert" className="m-0 text-danger">{error}</p>}
      <section ref={page} className="flex max-w-[880px] flex-col gap-6 rounded-[10px] border border-line bg-surface p-8">
        <span className="text-xs text-muted">TOR Scouter · {customer || 'Customer TOR'} · {today}</span>
        <div className="flex flex-wrap gap-8">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col">
              <span className={metaLabel}>{s.label}</span>
              <span className="text-[44px] leading-none tracking-[-0.03em] text-ink">{s.value}</span>
              <span className="text-xs text-muted">{s.note}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-medium text-ink">Assessment</h2>
          <p className="m-0 leading-[1.7]">
            Product รองรับ TOR ได้ {fit(a)} จาก {a.total} ข้อ ทั้งแบบพร้อมใช้งานและตั้งค่าเพิ่มเติม{strongest ? ` โมดูลที่รองรับเต็มรูปแบบมากที่สุดคือ ${strongest}` : ''} ส่วนที่ต้องเตรียมคือ
            Integration {a.counts.integ} ข้อ และ Customization {a.counts.custom} ข้อ
          </p>
        </div>
        {sol.zones.length > 0 && (
          <div className="flex flex-col gap-3" aria-labelledby="solution-h">
            <h2 id="solution-h" className="m-0 text-xl font-medium text-ink">สิ่งที่ต้องทำ และ tool ของ Buzzebees ที่ต้องใช้</h2>
            <p className="m-0 text-sm text-muted">
              ข้อหนึ่งนับในทุก tool ที่เกี่ยวข้อง จึงรวมกันได้มากกว่า {sol.total} ข้อ
              {sol.tools.length > 0 && <> · Tool ทั้งโปรเจกต์: {sol.tools.map((t) => `${t.label} (${t.total})`).join(', ')}</>}
            </p>
            <div className="flex flex-col gap-4">
              {sol.zones.map((z) => (
                <section key={z.zone} aria-label={`Solution ${z.label}`} className="flex flex-col gap-2 rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="m-0 text-base font-semibold text-ink">{z.label}</h3>
                    <span className="text-xs text-muted">{z.total} ข้อ</span>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                    {z.lines.map((l) => <ToolRow key={l.service} l={l} />)}
                  </ul>
                </section>
              ))}
            </div>
            {(sol.build > 0 || sol.api > 0 || sol.untagged > 0) && (
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
                {sol.build > 0 && <li>พัฒนาใหม่ {sol.build} ข้อ ไม่มี tool ของ Buzzebees รองรับ ต้องประเมินแรงงานแยก</li>}
                {sol.api > 0 && <li>ลูกค้าขอ API {sol.api} ข้อ ต้องถาม Tech ว่ายอมให้หรือไม่</li>}
                {sol.untagged > 0 && <li>{sol.untagged} ข้อยังไม่ได้จัด solution (ผลเก่า) รันประเมินใหม่เพื่อให้รวมในสรุปนี้</li>}
              </ul>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-xl font-medium text-ink">Before committing scope</h2>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
            <li>ยืนยัน {a.counts.verify} ข้อที่ Need Verification กับ Product team</li>
            <li>แยก Integration {a.counts.integ} ข้อเป็น Phase ที่ชัดเจน</li>
            <li>ไม่ Commit ข้อที่ Not Supported {a.counts.none} ข้อ จนกว่าจะมี Roadmap</li>
          </ul>
        </div>
        <Alert tone="warning" title={`PM validation: ${confirmed} of ${a.total} results confirmed`}>
          Generated by AI from the knowledge base. Confirm each result before sharing it.
        </Alert>
      </section>
    </>
  )
}

export default function Summary() {
  const a = useAssessment()
  return a ? <SummaryContent a={a} /> : <EmptyState title="Executive summary" lead="สรุปสำหรับผู้บริหารจากผลประเมินล่าสุด ดาวน์โหลดเป็น PDF ได้" />
}
