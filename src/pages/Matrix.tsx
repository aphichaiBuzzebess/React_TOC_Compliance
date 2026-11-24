import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { ORDER, STATUS } from '@/data/tor'
import { useAssessment } from '@/lib/useAssessment'
import { exportXlsx } from '@/lib/exportXlsx'
import type { Assessment } from '@/lib/assessment'
import type { Req } from '@/lib/types'
import { UNKNOWN, serviceLabel, zoneLabel, type Taxonomy } from '@/data/taxonomy'
import { Button, PageHeader, StatusBadge, EmptyState, metaLabel } from '@/components/ui'

const LEAD = 'ทุกข้อของ TOR พร้อมเหตุผลและหลักฐาน กดแถวเพื่อดูรายละเอียดทางขวา (หรือใช้ปุ่มลูกศรขึ้น/ลง) แล้วยืนยันผลทีละข้อ'
const API_TAG = 'ขอ API · ถาม Tech'
/** "Zone › Service" per target, e.g. "App project — Custom › Point Service". Empty for results saved before zones existed. */
const targetNames = (r: Req, tx: Taxonomy) => (r.targets ?? []).map((t) => (t.service === UNKNOWN ? zoneLabel(t.zone, tx) : `${zoneLabel(t.zone, tx)} › ${serviceLabel(t.service, tx)}`))
const TH = `border-b border-line bg-tint px-4 py-3 text-left ${metaLabel}`

/** Square 44px icon button used in the detail header. */
function IconButton({ label, className = '', ...p }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      {...p}
      className={`inline-flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  )
}

function MatrixContent({ a }: { a: Assessment }) {
  const { filter, query, selId, valid, coverage, customer, taxonomy: tx, setFilter, setQuery, select, validate } = useAssessmentStore()
  const [moduleFilter, setModuleFilter] = useState('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [apiOnly, setApiOnly] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false) // only matters below lg, where the detail is a bottom sheet
  const [exportError, setExportError] = useState<string | null>(null)
  const body = useRef<HTMLTableSectionElement>(null)
  const panel = useRef<HTMLElement>(null)

  const q = query.trim().toLowerCase()
  const rows = a.reqs.filter(
    (r) => (filter === 'all' || r.s === filter) && (moduleFilter === 'all' || r.module === moduleFilter) && (zoneFilter === 'all' || !!r.targets?.some((t) => t.zone === zoneFilter)) && (serviceFilter === 'all' || !!r.targets?.some((t) => t.service === serviceFilter)) && (!apiOnly || r.wantsApi === true) && (!q || `${r.id} ${r.text} ${r.module}`.toLowerCase().includes(q)),
  )
  const chips = [{ key: 'all' as const, label: 'All', count: a.total }, ...ORDER.map((k) => ({ key: k, label: STATUS[k].label, count: a.counts[k] }))]
  const modules = [...new Set(a.reqs.map((r) => r.module))]
  const hasTargets = a.reqs.some((r) => r.targets)
  const apiCount = a.reqs.filter((r) => r.wantsApi).length
  const filtering = filter !== 'all' || moduleFilter !== 'all' || zoneFilter !== 'all' || serviceFilter !== 'all' || apiOnly || q !== ''

  const sel = a.reqs.find((r) => r.id === selId) ?? rows[0]
  const idx = sel ? rows.findIndex((r) => r.id === sel.id) : -1
  const prev = idx > 0 ? rows[idx - 1] : undefined
  const next = idx >= 0 ? rows[idx + 1] : rows[0]
  const v = sel && valid[sel.id]
  const confirmed = a.reqs.filter((r) => valid[r.id] === 'ok').length
  const flagged = a.reqs.filter((r) => valid[r.id] === 'flag').length

  // A new requirement starts at the top of the detail, not wherever the last one was scrolled to.
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0
  }, [sel?.id])

  const pick = (id: string) => {
    select(id)
    setSheetOpen(true)
    // Below lg the detail is a bottom sheet that would cover the row just picked, so bring that row to the top.
    if (!window.matchMedia?.('(min-width: 64rem)').matches) {
      requestAnimationFrame(() => body.current?.querySelector(`tr[data-rid="${id}"]`)?.scrollIntoView?.({ block: 'start' }))
    }
  }
  const mark = (value: 'ok' | 'flag') => {
    if (!sel) return
    select(sel.id) // make sure the store is validating what the panel shows
    validate(value)
    if (next) pick(next.id)
  }
  const clear = () => {
    setFilter('all')
    setQuery('')
    setModuleFilter('all')
    setZoneFilter('all')
    setServiceFilter('all')
    setApiOnly(false)
  }
  async function doExport() {
    setExportError(null)
    try {
      await exportXlsx(a, coverage, valid, customer, tx)
    } catch {
      setExportError('Export failed. Try again.')
    }
  }
  // ↑/↓ move the selection and keep focus on the row's ID button.
  const onKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const id = (e.target as HTMLElement).closest('[data-rid]')?.getAttribute('data-rid')
    const i = rows.findIndex((r) => r.id === id)
    const to = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]
    if (i < 0 || !to) return
    e.preventDefault()
    pick(to.id)
    body.current?.querySelector<HTMLElement>(`button[data-rid="${to.id}"]`)?.focus() // the row already exists, so focus can follow at once (holding the key must not outrun it)
  }

  return (
    <>
      {exportError && <p role="alert" className="m-0 text-danger">{exportError}</p>}
      <PageHeader title="Compliance matrix" lead={LEAD} action={<Button variant="success" onClick={doExport}>Export Excel</Button>} />

      <div className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="q" className="sr-only">Search requirements</label>
          <input
            id="q"
            type="search"
            placeholder="Search ID, requirement or module"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 min-w-[220px] flex-[1_1_300px] rounded-lg border border-line-strong bg-surface px-3 text-sm"
          />
          <label htmlFor="mod" className="sr-only">Module</label>
          <select id="mod" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-surface text-sm">
            <option value="all">All modules</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {hasTargets && (
            <>
              <label htmlFor="zone" className="sr-only">Solution type</label>
              <select id="zone" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-surface text-sm">
                <option value="all">All solution types</option>
                {tx.zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                <option value={UNKNOWN}>ไม่ทราบ solution type</option>
              </select>
              <label htmlFor="svc" className="sr-only">Service</label>
              <select id="svc" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-surface text-sm">
                <option value="all">All services</option>
                {tx.services.map((sv) => <option key={sv.id} value={sv.id}>{sv.label}</option>)}
                <option value={UNKNOWN}>ไม่ระบุ service</option>
              </select>
            </>
          )}
          {filtering && <Button variant="ghost" onClick={clear}>ล้างตัวกรอง</Button>}
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const on = c.key === filter
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.key)}
                className={`min-h-11 rounded-full border px-4 text-[13px] transition-colors ${on ? 'border-ink bg-ink font-medium text-inverse' : 'border-line-strong bg-surface hover:border-ink'}`}
              >
                {c.label} · {c.count}
              </button>
            )
          })}
        </div>
        {apiCount > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={apiOnly} onClick={() => setApiOnly(!apiOnly)} className={`min-h-11 rounded-full border px-4 text-[13px] transition-colors ${apiOnly ? 'border-ink bg-ink font-medium text-inverse' : 'border-line-strong bg-surface hover:border-ink'}`}>
              {API_TAG} · {apiCount}
            </button>
          </div>
        )}
        <p className="m-0 text-xs text-muted" aria-live="polite">
          แสดง {rows.length} จาก {a.total} ข้อ · ยืนยันแล้ว {confirmed} · ติดธง {flagged} · ยังไม่ตรวจ {a.total - confirmed - flagged}
        </p>
      </div>

      <details className="rounded-[10px] border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-6 py-2 font-medium">ความหมายของสถานะ</summary>
        <ul className="m-0 flex list-none flex-col gap-2 p-0 px-6 pb-4 pt-1">
          {ORDER.map((k) => (
            <li key={k} className="flex flex-wrap items-baseline gap-2">
              <span className="inline-block min-w-48 whitespace-nowrap rounded border px-2 text-xs leading-5" style={{ color: STATUS[k].fg, background: STATUS[k].bg, borderColor: STATUS[k].bd }}>{STATUS[k].label}</span>
              <span className="text-muted">{STATUS[k].hint}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 rounded-[10px] border border-line bg-surface">
          <table className="w-full border-collapse">
            <caption className="sr-only">Requirements and their compliance status</caption>
            <thead>
              <tr>
                <th scope="col" className={`${TH} w-24 whitespace-nowrap pl-5`}>ID</th>
                <th scope="col" className={TH}>Requirement</th>
                <th scope="col" className={`${TH} hidden w-44 xl:table-cell`}>Status</th>
                <th scope="col" className={`${TH} hidden w-24 pr-5 text-right xl:table-cell`}>Conf.</th>
              </tr>
            </thead>
            <tbody ref={body} onKeyDown={onKeys}>
              {rows.map((r) => {
                const on = sel?.id === r.id
                const state = valid[r.id]
                return (
                  <tr key={r.id} data-rid={r.id} onClick={() => pick(r.id)} className={`scroll-mt-4 cursor-pointer transition-colors ${on ? 'bg-amber-soft' : 'hover:bg-tint'}`}>
                    <td className={`whitespace-nowrap border-b border-line py-2 pl-5 pr-2 align-top font-mono text-[13px] ${on ? 'shadow-[inset_3px_0_0_0_var(--color-amber)]' : ''}`}>
                      <button
                        type="button"
                        data-rid={r.id}
                        onClick={() => pick(r.id)}
                        aria-current={on ? 'true' : undefined}
                        className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center border-0 bg-transparent px-2 text-ink underline decoration-line-strong underline-offset-4"
                      >
                        {r.id}
                      </button>
                    </td>
                    <td className="border-b border-line px-4 py-3 align-top">
                      <p className="m-0 leading-7 text-ink wrap-anywhere">{r.text}</p>
                      <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{r.module}</span>
                        {targetNames(r, tx).map((n) => <span key={n}>{n}</span>)}
                        {r.wantsApi && <span className="font-medium text-danger">{API_TAG}</span>}
                        <span className="flex items-center gap-2 xl:hidden"><StatusBadge s={r.s} /><span className="tabular-nums">{r.conf}</span></span>
                        {state && <span className={state === 'ok' ? 'font-medium text-success' : 'font-medium text-danger'}>{state === 'ok' ? '✓ ยืนยันแล้ว' : '⚑ ติดธง'}</span>}
                      </p>
                    </td>
                    <td className="hidden border-b border-line px-4 py-3 align-top xl:table-cell"><StatusBadge s={r.s} /></td>
                    <td className="hidden border-b border-line py-3 pl-4 pr-5 text-right align-top tabular-nums text-muted xl:table-cell">{r.conf}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted">
                    ไม่พบ requirement ที่ตรงกับตัวกรอง <Button variant="ghost" onClick={clear}>ล้างตัวกรอง</Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">Showing {rows.length} of {a.total} · ↑ ↓ เลื่อนระหว่างรายการ</div>
          <div aria-hidden className={sheetOpen ? 'h-[50vh] lg:hidden' : 'hidden'} />
        </div>

        <aside
          ref={panel}
          aria-label="Requirement detail"
          onKeyDown={(e) => e.key === 'Escape' && setSheetOpen(false)}
          className={`${sheetOpen ? 'fixed inset-x-0 bottom-0 z-40 max-h-[62vh] overflow-y-auto rounded-t-2xl border-t border-line shadow-[0_-12px_32px_-12px_rgba(8,9,9,0.3)]' : 'hidden'} bg-surface lg:static lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:rounded-[10px] lg:border lg:shadow-none lg:sticky xl:top-24 xl:max-h-[calc(100vh-7.5rem)]`}
        >
          {sel ? (
            <>
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface px-5 py-2.5">
                <span className="font-mono text-[13px]">{sel.id} <span className="font-sans text-muted">· {sel.module}</span></span>
                <div className="flex items-center gap-1">
                  {idx >= 0 && <span className="px-1 text-xs tabular-nums text-muted">{idx + 1} / {rows.length}</span>}
                  <IconButton label="Previous requirement" disabled={!prev} onClick={() => prev && pick(prev.id)}><ChevronLeft aria-hidden size={18} /></IconButton>
                  <IconButton label="Next requirement" disabled={!next} onClick={() => next && pick(next.id)}><ChevronRight aria-hidden size={18} /></IconButton>
                  <IconButton label="Close detail" className="lg:hidden" onClick={() => setSheetOpen(false)}><X aria-hidden size={18} /></IconButton>
                </div>
              </div>

              <div className="flex flex-col gap-5 px-5 py-5">
                <p className="m-0 text-[17px] leading-8 text-ink wrap-anywhere">{sel.text}</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge s={sel.s} /><span className="text-xs text-muted">Confidence {sel.conf}</span></div>
                  <p className="m-0 text-xs leading-5 text-muted">{STATUS[sel.s].hint}</p>
                </div>
                {(sel.targets || sel.wantsApi) && (
                  <section className="flex flex-col gap-1.5">
                    <h2 className={`m-0 text-xs ${metaLabel}`}>Solution type and service</h2>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] leading-6">
                      {targetNames(sel, tx).map((n) => <li key={n}>{n}</li>)}
                    </ul>
                    {sel.wantsApi && <p className="m-0 text-[13px] font-medium text-danger">{API_TAG}: ลูกค้าสร้างระบบเอง ต้องให้ Tech ตัดสินก่อนสรุปผล</p>}
                  </section>
                )}
                <section className="flex flex-col gap-1.5">
                  <h2 className={`m-0 text-xs ${metaLabel}`}>Agent reasoning</h2>
                  <p className="m-0 leading-7 wrap-anywhere">{sel.reason}</p>
                </section>
                <section className="flex flex-col gap-1.5">
                  <h2 className={`m-0 text-xs ${metaLabel}`}>Evidence reference</h2>
                  <div className="flex items-start gap-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
                    <BookOpen aria-hidden size={14} className="mt-1.5 flex-none text-muted" />
                    <span className="text-[13px] leading-6 wrap-anywhere">{sel.evidence}</span>
                  </div>
                </section>
                <section className="flex flex-col gap-1.5">
                  <h2 className={`m-0 text-xs ${metaLabel}`}>Recommendation</h2>
                  <p className="m-0 leading-7 wrap-anywhere">{sel.rec}</p>
                </section>
              </div>

              <div className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-surface px-5 py-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">PM validation</span>
                  <span role="status" className={`text-xs ${v === 'ok' ? 'text-success' : v === 'flag' ? 'text-danger' : 'text-muted'}`}>
                    {v === 'ok' ? 'Confirmed by PM' : v === 'flag' ? 'Flagged for review' : 'Not yet validated'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" arrow onClick={() => mark('ok')}>Confirm result</Button>
                  <Button variant="danger" onClick={() => mark('flag')}>Flag for review</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-6 py-12 text-center text-muted">เลือก requirement เพื่อดูเหตุผล หลักฐาน และคำแนะนำของ agent</div>
          )}
        </aside>
      </div>
    </>
  )
}

export default function Matrix() {
  const a = useAssessment()
  return a ? <MatrixContent a={a} /> : <EmptyState title="Compliance matrix" lead={LEAD} />
}
