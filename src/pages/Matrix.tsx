import { useRef, useState } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { useAssessment } from '@/lib/useAssessment'
import { exportXlsx } from '@/lib/exportXlsx'
import { featureOf } from '@/lib/evidence'
import { GROUPS, bySeverity, groupOf, score, type Score } from '@/lib/verdict'
import { orderedModules, catRank } from '@/data/categories'
import type { Assessment } from '@/lib/assessment'
import type { Req } from '@/lib/types'
import { UNKNOWN, serviceLabel, solutionLabel, type Taxonomy } from '@/data/taxonomy'
import { Button, EmptyState } from '@/components/ui'
import { Dot, ReqDrawer, St } from '@/components/tor'
import ResultHead from '@/components/ResultHead'
import { cn } from '@/lib/utils'

const LEAD = 'ทุกข้อของ TOR พร้อมผล ระดับ และ feature ของเราที่ตรงกัน กดข้อเพื่อดูเหตุผล หลักฐาน และสิ่งที่ยังขาด'
const API_TAG = 'ขอ API · ถาม Tech'
/** "Solution › Service" per target. Empty for results saved before solutions existed. */
const targetNames = (r: Req, tx: Taxonomy) => (r.targets ?? []).map((t) => (t.service === UNKNOWN ? solutionLabel(t.solution, tx) : `${solutionLabel(t.solution, tx)} › ${serviceLabel(t.service, tx)}`))
const COLS = 'md:grid-cols-[64px_minmax(0,2.3fr)_88px_150px_minmax(0,1.6fr)]'
const pill = (on: boolean) => cn('inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition-colors', on ? 'border-ink bg-ink font-medium text-inverse' : 'border-line-strong bg-surface text-ink hover:border-ink')

type GroupKey = keyof Score['g'] | ''

function MatrixContent({ a }: { a: Assessment }) {
  const { query, valid, coverage, customer, project, taxonomy: tx, setQuery } = useAssessmentStore()
  const [group, setGroup] = useState<GroupKey>('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [solutionFilter, setSolutionFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [mandOnly, setMandOnly] = useState(false)
  const [apiOnly, setApiOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const s = score(a.reqs)

  const q = query.trim().toLowerCase()
  const rows = bySeverity(a.reqs)
    .sort((x, y) => catRank(x.module) - catRank(y.module))
    .filter(
      (r) =>
        (!group || groupOf(r.s) === group) &&
        (moduleFilter === 'all' || r.module === moduleFilter) &&
        (solutionFilter === 'all' || !!r.targets?.some((t) => t.solution === solutionFilter)) &&
        (serviceFilter === 'all' || !!r.targets?.some((t) => t.service === serviceFilter)) &&
        (!mandOnly || r.pri !== 'O') &&
        (!apiOnly || r.wantsApi === true) &&
        (!q || `${r.id} ${r.text} ${r.module} ${r.orig ?? ''}`.toLowerCase().includes(q)),
    )
  const modules = orderedModules(a.reqs)
  const hasTargets = a.reqs.some((r) => r.targets)
  const apiCount = a.reqs.filter((r) => r.wantsApi).length
  const filtering = group !== '' || moduleFilter !== 'all' || solutionFilter !== 'all' || serviceFilter !== 'all' || mandOnly || apiOnly || q !== ''
  const confirmed = a.reqs.filter((r) => valid[r.id] === 'ok').length
  const flagged = a.reqs.filter((r) => valid[r.id] === 'flag').length

  const clear = () => {
    setGroup('')
    setQuery('')
    setModuleFilter('all')
    setSolutionFilter('all')
    setServiceFilter('all')
    setMandOnly(false)
    setApiOnly(false)
  }
  async function doExport() {
    setExportError(null)
    try {
      await exportXlsx(a, coverage, valid, project.title || customer, tx) // the file is named for the project, else the customer
    } catch {
      setExportError('Export ไม่สำเร็จ ลองอีกครั้ง')
    }
  }
  // ↑/↓ move between rows.
  const onKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const id = (e.target as HTMLElement).closest('[data-rid]')?.getAttribute('data-rid')
    const i = rows.findIndex((r) => r.id === id)
    const to = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]
    if (i < 0 || !to) return
    e.preventDefault()
    list.current?.querySelector<HTMLElement>(`[data-rid="${to.id}"]`)?.focus()
  }

  return (
    <>
      {exportError && <p role="alert" className="m-0 text-danger">{exportError}</p>}
      <ResultHead action={<Button variant="success" onClick={doExport}>Export Excel</Button>} />
      <div className="flex flex-col gap-4">
      <p className="m-0 max-w-3xl text-sm leading-6 text-muted">{LEAD}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <div role="group" aria-label="กรองตามผล" className="flex flex-wrap gap-1 rounded-full bg-tint p-1">
          {[{ k: '' as GroupKey, label: 'ทั้งหมด', n: a.total }, ...GROUPS.map((g) => ({ k: g.k as GroupKey, label: g.label, n: s.g[g.k] }))].map((c) => (
            <button key={c.k || 'all'} type="button" aria-pressed={group === c.k} onClick={() => setGroup(c.k)} className={cn('inline-flex h-9 items-center gap-2 rounded-full border-0 px-3.5 text-sm transition-colors', group === c.k ? 'bg-surface font-semibold text-ink shadow-sm' : 'bg-transparent text-muted hover:text-ink')}>
              {c.k && <GroupDot k={c.k} />}
              {c.label}
              <span className="tabular-nums text-muted">{c.n}</span>
            </button>
          ))}
        </div>
        <label htmlFor="mod" className="sr-only">หมวด</label>
        <select id="mod" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="h-10 rounded-full border border-line-strong bg-surface text-sm">
          <option value="all">ทุกหมวด</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {hasTargets && (
          <>
            <label htmlFor="solution" className="sr-only">Solution</label>
            <select id="solution" value={solutionFilter} onChange={(e) => setSolutionFilter(e.target.value)} className="h-10 rounded-full border border-line-strong bg-surface text-sm">
              <option value="all">All solutions</option>
              {tx.solutions.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              <option value={UNKNOWN}>ไม่ทราบ solution</option>
            </select>
            <label htmlFor="svc" className="sr-only">Service</label>
            <select id="svc" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="h-10 rounded-full border border-line-strong bg-surface text-sm">
              <option value="all">All services</option>
              {tx.services.map((sv) => <option key={sv.id} value={sv.id}>{sv.label}</option>)}
              <option value={UNKNOWN}>ไม่ระบุ service</option>
            </select>
          </>
        )}
        <button type="button" aria-pressed={mandOnly} onClick={() => setMandOnly(!mandOnly)} className={pill(mandOnly)}>เฉพาะข้อบังคับ</button>
        {apiCount > 0 && <button type="button" aria-pressed={apiOnly} onClick={() => setApiOnly(!apiOnly)} className={pill(apiOnly)}>{API_TAG} · {apiCount}</button>}
        {filtering && <Button variant="ghost" onClick={clear}>ล้างตัวกรอง</Button>}
        <label htmlFor="q" className="sr-only">ค้นหา requirement</label>
        <input id="q" type="search" placeholder="ค้นหา" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full rounded-full border border-line-strong bg-surface px-4 text-sm sm:ml-auto sm:w-[200px]" />
      </div>
      </div>

      <div ref={list} onKeyDown={onKeys} role="table" aria-label="Requirement รายข้อ" className="flex flex-col">
        <div role="row" className={`hidden gap-[18px] border-b border-line px-3 pb-2.5 text-[13px] text-muted md:grid ${COLS}`}>
          <span role="columnheader">ข้อ</span><span role="columnheader">Requirement</span><span role="columnheader">ระดับ</span><span role="columnheader">ผล</span><span role="columnheader">Feature ของเรา</span>
        </div>
        {rows.map((r) => {
          const f = featureOf(r.evidence)
          const state = valid[r.id]
          return (
            <div key={r.id} role="row">
              <button
                type="button"
                data-rid={r.id}
                onClick={() => setOpen(r.id)}
                aria-label={`${r.id} ${r.text}`}
                className={`grid w-full grid-cols-[64px_minmax(0,1fr)] items-center gap-x-[18px] gap-y-1.5 border-0 border-b border-line bg-transparent px-3 py-3 text-left transition-colors hover:bg-tint ${COLS} ${open === r.id ? 'bg-amber-soft' : ''}`}
              >
                <span role="cell" className="self-start font-mono text-[13px] text-muted md:self-center">{r.id}</span>
                <span role="cell" className="min-w-0">
                  <span className="block font-medium text-ink wrap-anywhere">{r.text}</span>
                  <span className="mt-px flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-muted">
                    <span>{r.module}</span>
                    {targetNames(r, tx).map((n) => <span key={n}>{n}</span>)}
                    {r.wantsApi && <span className="font-medium text-danger">{API_TAG}</span>}
                    {r.override && <span className="rounded-full border border-line-strong px-[7px] text-xs font-medium text-ink">แก้โดย BD</span>}
                    {state && <span className={state === 'ok' ? 'font-medium text-success' : 'font-medium text-danger'}>{state === 'ok' ? '✓ ยืนยันแล้ว' : '⚑ ติดธง'}</span>}
                  </span>
                </span>
                <span role="cell" className="col-start-2 text-sm text-ink md:col-start-auto">{r.pri === 'O' ? 'ไม่บังคับ' : 'บังคับ'}</span>
                <span role="cell" className="col-start-2 md:col-start-auto"><St s={r.s} /></span>
                <span role="cell" className="col-start-2 flex min-w-0 flex-col md:col-start-auto">
                  {f ? <span className="font-medium text-ink wrap-anywhere">{f.title}</span> : <span className="text-muted">ไม่พบใน KB</span>}
                  {r.s !== 'full' && r.gap && <span className="line-clamp-2 text-sm text-muted">ขาด: {r.gap}</span>}
                </span>
              </button>
            </div>
          )
        })}
        {rows.length === 0 && (
          <div className="px-6 py-[72px] text-center text-muted">
            <b className="mb-1 block text-lg font-semibold text-ink">ไม่มีข้อที่ตรงกับตัวกรอง</b>
            <Button variant="ghost" onClick={clear}>ล้างตัวกรอง</Button>
          </div>
        )}
      </div>
      <p className="m-0 text-[13.5px] text-muted" aria-live="polite">
        แสดง {rows.length} จาก {a.total} ข้อ · ยืนยันแล้ว {confirmed} · ติดธง {flagged} · ยังไม่ตรวจ {a.total - confirmed - flagged} · ↑ ↓ เลื่อนระหว่างข้อ
      </p>
      {open && <ReqDrawer id={open} ids={rows.map((r) => r.id)} onOpen={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

/** The colour of a group: "มีงานเพิ่ม" takes the development colour. */
const GroupDot = ({ k }: { k: Exclude<GroupKey, ''> }) => <Dot s={k === 'work' ? 'custom' : GROUPS.find((g) => g.k === k)!.keys[0]} />

export default function Matrix() {
  const a = useAssessment()
  return a ? <MatrixContent a={a} /> : <EmptyState title="Compliance matrix" lead={LEAD} />
}
