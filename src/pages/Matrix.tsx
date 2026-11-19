import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { ORDER, STATUS } from '@/data/tor'
import { useAssessment } from '@/lib/useAssessment'
import { exportXlsx } from '@/lib/exportXlsx'
import type { Assessment } from '@/lib/assessment'
import { Button, Card, PageHeader, StatusBadge, EmptyState, metaLabel } from '@/components/ui'

const LABEL = metaLabel
const TH = `border-b border-line bg-tint px-4 py-3 text-left ${metaLabel}`

function MatrixContent({ a }: { a: Assessment }) {
  const [exportError, setExportError] = useState<string | null>(null)
  async function doExport() {
    setExportError(null)
    try {
      await exportXlsx(a, coverage, valid, customer)
    } catch {
      setExportError('Export failed. Try again.')
    }
  }
  const { filter, query, selId, valid, coverage, customer, setFilter, setQuery, select, validate } = useAssessmentStore()
  const q = query.toLowerCase()
  const rows = a.reqs.filter((r) => (filter === 'all' || r.s === filter) && (!q || `${r.id} ${r.text} ${r.module}`.toLowerCase().includes(q)))
  const chips = [{ key: 'all' as const, label: 'All', count: a.total }, ...ORDER.map((k) => ({ key: k, label: STATUS[k].label, count: a.counts[k] }))]
  const sel = a.reqs.find((r) => r.id === selId)
  const v = sel && valid[sel.id]

  return (
    <>
      {exportError && <p role="alert" className="m-0 text-[#CF1322]">{exportError}</p>}
      <PageHeader title="Compliance matrix" lead="ตาราง requirement ทั้งหมดพร้อมเหตุผลและหลักฐาน กดรหัสเพื่อดูรายละเอียดและยืนยันผล" action={<Button variant="success" onClick={doExport}>Export Excel</Button>} />

      <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-white px-6 py-4">
        <label htmlFor="q" className="sr-only">Search requirements</label>
        <input
          id="q"
          type="search"
          placeholder="Search ID, requirement or module"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 flex-[1_1_260px] rounded-lg border border-line-strong px-[11px] text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = c.key === filter
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.key)}
                className={`min-h-11 rounded-full border px-3 text-[13px] ${on ? 'border-brand bg-brand-soft font-medium text-brand-text' : 'border-line-strong bg-white'}`}
              >
                {c.label} · {c.count}
              </button>
            )
          })}
        </div>
      </div>

      <details className="rounded-[10px] border border-line bg-white px-6 py-3">
        <summary className="cursor-pointer font-medium">ความหมายของสถานะ</summary>
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
          {ORDER.map((k) => (
            <li key={k} className="flex flex-wrap items-baseline gap-2">
              <span className="inline-block min-w-48 whitespace-nowrap rounded border px-2 text-xs leading-5" style={{ color: STATUS[k].fg, background: STATUS[k].bg, borderColor: STATUS[k].bd }}>{STATUS[k].label}</span>
              <span className="text-muted">{STATUS[k].hint}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="min-w-0 flex-[999_1_560px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} pl-6`}>ID</th>
                  <th className={TH}>Requirement</th>
                  <th className={TH}>Module</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} pr-6 text-right`}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.id === selId ? 'bg-brand-soft' : 'bg-white'}>
                    <td className="whitespace-nowrap border-b border-line py-3 pl-6 pr-4 align-top font-mono text-[13px]">
                      <button type="button" onClick={() => select(r.id)} className="border-0 bg-transparent p-0 text-brand-text underline">{r.id}</button>
                    </td>
                    <td className="border-b border-line px-4 py-3 align-top">{r.text}</td>
                    <td className="whitespace-nowrap border-b border-line px-4 py-3 align-top text-muted">{r.module}</td>
                    <td className="border-b border-line px-4 py-3 align-top"><StatusBadge s={r.s} /></td>
                    <td className="border-b border-line py-3 pl-4 pr-6 text-right align-top">{r.conf}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-muted">No requirements match</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 text-xs text-muted">Showing {rows.length} rows of {a.total} · select an ID to see evidence</div>
        </Card>

        <aside aria-label="Requirement detail" className="min-w-0 flex-[1_1_320px] rounded-[10px] border border-line bg-white">
          {sel ? (
            <>
              <div className="flex flex-col gap-2 border-b border-line px-6 py-4">
                <span className="font-mono text-[13px] text-brand-text">{sel.id} · {sel.module}</span>
                <h2 className="m-0 text-xl font-medium text-ink">{sel.text}</h2>
                <div className="flex flex-wrap items-center gap-2"><StatusBadge s={sel.s} /><span className="text-xs text-muted">Confidence {sel.conf}</span></div>
                <p className="m-0 text-xs text-muted">{STATUS[sel.s].hint}</p>
              </div>
              <div className="flex flex-col gap-4 px-6 py-4">
                <div className="flex flex-col gap-1"><span className={LABEL}>Agent reasoning</span><p className="m-0">{sel.reason}</p></div>
                <div className="flex flex-col gap-1">
                  <span className={LABEL}>Evidence reference</span>
                  <div className="flex items-start gap-2 rounded-md border border-line bg-[#FAFAFA] px-3 py-2.5">
                    <BookOpen aria-hidden size={14} className="mt-1 flex-none text-[#595959]" />
                    <span className="text-[13px]">{sel.evidence}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1"><span className={LABEL}>Recommendation</span><p className="m-0">{sel.rec}</p></div>
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <span className="font-medium">PM validation</span>
                  <span className={`text-xs ${v === 'ok' ? 'text-[#237804]' : v === 'flag' ? 'text-[#CF1322]' : 'text-muted'}`}>
                    {v === 'ok' ? 'Confirmed by PM' : v === 'flag' ? 'Flagged for review' : 'Not yet validated'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => validate('ok')}>Confirm result</Button>
                    <Button variant="danger" onClick={() => validate('flag')}>Flag for review</Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="px-6 py-12 text-center text-muted">Select a requirement ID to see the agent's evidence and recommendation.</div>
          )}
        </aside>
      </div>
    </>
  )
}

export default function Matrix() {
  const a = useAssessment()
  return a ? <MatrixContent a={a} /> : <EmptyState title="Compliance matrix" lead="ตาราง requirement ทั้งหมดพร้อมเหตุผลและหลักฐาน กดรหัสเพื่อดูรายละเอียดและยืนยันผล" />
}
