import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { authHeaders, useAssessmentStore } from '@/store/useAssessmentStore'
import { Alert, Button, PageHeader } from '@/components/ui'
import { cn } from '@/lib/utils'
import { SORTS, STATUS_LABEL, TYPE_LABEL, bySort, money, needStats, type NeedStats, type ScoutGap, type ScoutItem, type ScoutStatus, type ScoutType, type SortKey } from '@/lib/scouter'

const CSRF = { 'x-requested-with': 'tor-scouter' }
async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  // authHeaders: the AI of AI settings rides along, so grouping uses the same AI as reading a TOR (a typed key too, not only a saved one).
  const res = await fetch(url, { method, headers: { ...CSRF, ...authHeaders(useAssessmentStore.getState()), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json as T
}

const STATUSES = Object.keys(STATUS_LABEL) as ScoutStatus[]
const TYPES = Object.keys(TYPE_LABEL) as ScoutType[]
/** The product status as a dot: not looked at yet is an outline, released is the "supported" green. */
const STATUS_DOT: Record<ScoutStatus, React.CSSProperties> = {
  new: { boxShadow: 'inset 0 0 0 1.5px var(--color-muted)' },
  reviewing: { background: 'var(--color-muted)' },
  planned: { background: 'color-mix(in srgb, var(--color-ink) 70%, transparent)' },
  in_dev: { background: 'var(--color-ink)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-ink) 15%, transparent)' },
  released: { background: 'var(--st-full-dot)' },
  rejected: { background: 'var(--color-line-strong)' },
}
const StatusDot = ({ s }: { s: ScoutStatus }) => <i aria-hidden className="inline-block size-2 flex-none rounded-full" style={STATUS_DOT[s]} />
const fmtDate = (iso: string) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '–')
const RECENT_DAYS = 3
const DEAL_LABEL = { open: 'ยังไม่ปิดดีล', won: 'ชนะ', lost: 'แพ้' } as const
const key = (g: Pick<ScoutGap, 'assessmentId' | 'reqId'>) => ({ assessmentId: g.assessmentId, reqId: g.reqId })

interface Data { items: ScoutItem[]; gaps: ScoutGap[]; admin: boolean }
type Row = { it: ScoutItem; m: NeedStats; gaps: ScoutGap[] }

export default function Scouter() {
  const mode = useAssessmentStore((s) => s.mode)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [grouping, setGrouping] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [type, setType] = useState<ScoutType | ''>('')
  const [module, setModule] = useState('')
  const [sort, setSort] = useState<SortKey>('tors')
  const [open, setOpen] = useState<string | null>(null)
  const autoGrouped = useRef(false)

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('GET', '/api/scouter'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    }
  }, [])
  const group = useCallback(async () => {
    setGrouping(true)
    try {
      await api('POST', '/api/scouter?action=group')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'จัดกลุ่มไม่สำเร็จ')
    } finally {
      setGrouping(false)
      await load()
    }
  }, [load])
  useEffect(() => { if (mode === 'account') void load() }, [mode, load])
  /** Admins: bring in the gaps of TORs saved before the Scouter existed, then group them. Safe to run again. */
  const backfill = useCallback(async () => {
    setBackfilling(true)
    setNote(null)
    try {
      const r = await api<{ tors: number; gaps: number; skipped: number }>('POST', '/api/scouter?action=backfill')
      setNote(`ดึงจาก TOR ที่มีอยู่ ${r.tors} ฉบับ ได้ ${r.gaps} ข้อที่ขาด${r.skipped ? ` (ข้าม ${r.skipped} ฉบับที่เปิดไม่ได้)` : ''}`)
      autoGrouped.current = true // grouping runs here, not again from the reload
      await group()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ดึงข้อมูลไม่สำเร็จ')
    } finally {
      setBackfilling(false)
    }
  }, [group])
  // Gaps that came in since the last grouping are grouped when the page opens, once.
  useEffect(() => {
    if (!data || autoGrouped.current || !data.gaps.some((g) => !g.itemId)) return
    autoGrouped.current = true
    void group()
  }, [data, group])

  const rows: Row[] = useMemo(() => (data?.items ?? []).map((it) => {
    const gaps = data!.gaps.filter((g) => g.itemId === it.id)
    return { it, gaps, m: needStats(gaps) }
  }), [data])
  const counted = rows.filter((r) => r.m.tors > 0)
  const shown = counted.filter((r) => (!type || r.it.type === type) && (!module || r.it.module === module)).sort((a, b) => bySort(sort)(a.m, b.m))
  const maxT = Math.max(1, ...shown.map((r) => r.m.tors))
  const modules = [...new Set(counted.map((r) => r.it.module).filter(Boolean))]
  const okGaps = (data?.gaps ?? []).filter((g) => g.confirmed && g.itemId)
  const torsTotal = counted.reduce((n, r) => n + r.m.tors, 0)
  const customers = new Set(okGaps.map((g) => g.customer)).size
  const lost = counted.reduce((n, r) => n + r.m.lost, 0)
  const pending = (data?.gaps ?? []).filter((g) => !g.confirmed).length
  const ungrouped = (data?.gaps ?? []).filter((g) => !g.itemId)
  const isAdmin = !!data?.admin

  async function setStatus(id: string, status: ScoutStatus) {
    try { await api('PATCH', '/api/scouter', { id, status }); await load() } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
  }

  if (mode !== 'account') {
    return (
      <>
        <PageHeader title="Feature Scouter" lead="สิ่งที่ลูกค้าขอใน TOR แต่ product ยังไม่มีหรือยังไม่ครบ รวมจากทุก TOR ของทีม" />
        <Alert tone="info" title="ใช้ได้เมื่อเปิดระบบบัญชี">Feature Scouter รวมข้อที่ขาดจาก TOR ของทุกคน จึงต้องมี database และล็อกอินก่อน</Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Feature Scouter" lead="สิ่งที่ลูกค้าขอใน TOR แต่ product ยังไม่มีหรือยังไม่ครบ เรียงตามจำนวนครั้งที่ถูกขอ ทีม Product อัปเดตได้ว่าแต่ละเรื่องตัดสินใจไปถึงไหน" />
      <div className="flex flex-col gap-6">
        {error && <p role="alert" className="m-0 text-danger">{error} <Button variant="ghost" onClick={() => void load()}>ลองใหม่</Button></p>}
        {data === null && !error && <p role="status" className="m-0 text-muted">กำลังโหลด…</p>}
        {data && (
          <>
            <dl aria-label="ภาพรวม" className="m-0 grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-4">
              {[
                [String(counted.length), 'ความต้องการ'],
                [String(torsTotal), 'ครั้งที่ถูกขอใน TOR'],
                [String(customers), 'ลูกค้าที่ขอ'],
                [money(lost), 'ดีลที่แพ้เพราะขาดฟีเจอร์'],
              ].map(([n, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-[13.5px] text-muted">{label}</dt>
                  <dd className="m-0 text-[32px] font-semibold leading-tight tracking-[-0.04em] text-ink tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                <Button disabled={backfilling || grouping} onClick={() => void backfill()}>{backfilling ? 'กำลังดึง…' : 'ดึงจาก TOR ที่บันทึกไว้แล้ว'}</Button>
                <span>{note ?? 'สำหรับ TOR ที่ประเมินก่อนมี Feature Scouter กดซ้ำได้ ไม่เกิดรายการซ้ำ'}</span>
              </div>
            )}

            {(pending > 0 || ungrouped.length > 0) && (
              <p role="status" className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                {pending > 0 && <span>นับเฉพาะข้อที่ PM ยืนยันแล้ว · รอ PM ยืนยันอีก {pending} ข้อ</span>}
                {ungrouped.length > 0 && <span>{grouping ? 'กำลังจัดกลุ่ม…' : `ยังไม่ได้จัดกลุ่ม ${ungrouped.length} ข้อ`}</span>}
                {ungrouped.length > 0 && !grouping && <Button variant="ghost" onClick={() => void group()}>จัดกลุ่มตอนนี้</Button>}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <div role="group" aria-label="ประเภท" className="flex flex-wrap gap-1 rounded-full bg-tint p-1">
                {[{ k: '' as ScoutType | '', l: 'ทั้งหมด' }, ...TYPES.map((k) => ({ k, l: TYPE_LABEL[k] }))].map((o) => (
                  <button key={o.k || 'all'} type="button" aria-pressed={type === o.k} onClick={() => setType(o.k)} className={cn('h-9 rounded-full border-0 px-3.5 text-sm transition-colors', type === o.k ? 'bg-surface font-semibold text-ink shadow-sm' : 'bg-transparent text-muted hover:text-ink')}>{o.l}</button>
                ))}
              </div>
              <label htmlFor="sc-mod" className="sr-only">หมวด</label>
              <select id="sc-mod" value={module} onChange={(e) => setModule(e.target.value)} className="h-10 rounded-full border border-line-strong bg-surface text-sm">
                <option value="">ทุกหมวด</option>
                {modules.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <label htmlFor="sc-sort" className="sr-only">เรียงตาม</label>
              <select id="sc-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-10 rounded-full border border-line-strong bg-surface text-sm sm:ml-auto">
                {SORTS.map(([k, l]) => <option key={k} value={k}>เรียงตาม: {l}</option>)}
              </select>
            </div>

            {shown.length === 0 ? (
              <div className="rounded-card border border-line bg-surface px-6 py-16 text-center">
                <p className="m-0 text-lg font-semibold text-ink">{counted.length ? 'ไม่มีรายการในตัวกรองนี้' : 'ยังไม่มีความต้องการที่นับได้'}</p>
                <p className="m-0 mt-1 text-sm text-muted">{counted.length ? 'ลองเปลี่ยนตัวกรอง' : 'ข้อที่ขาดจะมาที่นี่เมื่อ TOR ประเมินเสร็จ และนับเมื่อ PM ยืนยันผลข้อนั้นแล้ว'}</p>
              </div>
            ) : (
              <div role="table" aria-label="ความต้องการ" className="flex flex-col">
                <div role="row" className="hidden grid-cols-[44px_minmax(0,1fr)_250px_190px] gap-6 border-b border-line pb-3 text-[13px] text-muted md:grid">
                  <span role="columnheader">อันดับ</span><span role="columnheader">ความต้องการ</span><span role="columnheader">ถูกขอบ่อยแค่ไหน</span><span role="columnheader">สถานะฝั่ง Product</span>
                </div>
                <div role="rowgroup" className="flex flex-col">
                  {shown.map(({ it, m }, k) => {
                    const fresh = Date.now() - new Date(it.createdAt).getTime() < RECENT_DAYS * 864e5
                    return (
                      <div key={it.id} role="row" className="-mx-3.5 grid grid-cols-[32px_minmax(0,1fr)] items-start gap-x-4 gap-y-3 rounded-2xl border-t border-line px-3.5 py-5 transition-colors first:border-t-0 hover:border-transparent hover:bg-tint md:grid-cols-[44px_minmax(0,1fr)_250px_190px] md:gap-6 [&:hover+[role=row]]:border-transparent">
                        <span role="cell" className="pt-0.5 text-lg font-semibold text-muted tabular-nums">{k + 1}</span>
                        <div role="cell" className="min-w-0">
                          <button type="button" onClick={() => setOpen(it.id)} className="flex w-full flex-col gap-1 border-0 bg-transparent p-0 text-left">
                            <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink wrap-anywhere">{it.title}</span>
                            {it.need && <span className="text-sm leading-relaxed text-muted wrap-anywhere">{it.need}</span>}
                            <span className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                              {[TYPE_LABEL[it.type], it.module, it.id].filter(Boolean).map((t) => <span key={t} className="rounded-full border border-line-strong px-2 py-px">{t}</span>)}
                              {fresh && <span className="rounded-full bg-amber-soft px-2 py-px font-medium text-amber-text">เพิ่งเพิ่ม</span>}
                            </span>
                          </button>
                        </div>
                        <div role="cell" className="col-start-2 flex flex-col gap-2 md:col-start-auto">
                          <div className="flex items-baseline gap-2"><b className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-ink tabular-nums">{m.tors}</b><span className="text-sm text-muted">TOR ที่ขอ</span></div>
                          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-tint"><i className="block h-full rounded-full bg-amber" style={{ width: `${(m.tors / maxT) * 100}%` }} /></div>
                          <div className="flex flex-wrap gap-x-3 text-[13px] text-muted">
                            <span><b className="font-semibold text-ink">{m.customers}</b> ลูกค้า</span>
                            <span>บังคับ <b className="font-semibold text-ink">{m.mand}</b></span>
                            <span>ดีล <b className="font-semibold text-ink">{money(m.deal)}</b></span>
                            {m.pending > 0 && <span>รอยืนยัน {m.pending}</span>}
                          </div>
                        </div>
                        <div role="cell" className="col-start-2 md:col-start-auto">
                          {isAdmin ? (
                            <span className="relative block">
                              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"><StatusDot s={it.status} /></span>
                              <label className="sr-only" htmlFor={`st-${it.id}`}>สถานะฝั่ง Product ของ {it.title}</label>
                              <select id={`st-${it.id}`} value={it.status} onChange={(e) => void setStatus(it.id, e.target.value as ScoutStatus)} className="h-10 w-full rounded-full border border-line-strong bg-surface pl-8 text-sm">
                                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                              </select>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-sm font-medium text-ink"><StatusDot s={it.status} />{STATUS_LABEL[it.status]}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {isAdmin && ungrouped.length > 0 && !grouping && <Ungrouped gaps={ungrouped} items={data.items} onDone={load} onError={setError} />}
          </>
        )}
      </div>
      {open && data && (() => {
        const row = rows.find((r) => r.it.id === open)
        return row ? <NeedDrawer row={row} items={data.items} admin={isAdmin} onClose={() => setOpen(null)} onChanged={load} onError={setError} /> : null
      })()}
    </>
  )
}

/** Admins: gaps the AI could not group (or no server AI), to put in a need by hand or start a new one. */
function Ungrouped({ gaps, items, onDone, onError }: { gaps: ScoutGap[]; items: ScoutItem[]; onDone: () => Promise<void>; onError: (m: string) => void }) {
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await onDone() } catch (e) { onError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') } }
  return (
    <section aria-labelledby="ug-h" className="flex flex-col gap-3 border-t border-line pt-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="ug-h" className="m-0 text-base font-semibold text-ink">ยังไม่ได้จัดกลุ่ม</h2>
        <p className="m-0 text-sm text-muted">จัดเข้าความต้องการที่มี หรือสร้างใหม่จากข้อนั้น</p>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {gaps.map((g) => (
          <li key={`${g.assessmentId}/${g.reqId}`} className="flex flex-wrap items-center gap-3 border-t border-line py-3 first:border-t-0">
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-ink wrap-anywhere">{g.text}</span>
              <span className="block text-[13px] text-muted">{g.customer} · {g.tor} · ขาด: {g.gap}</span>
            </span>
            <label className="sr-only" htmlFor={`ug-${g.assessmentId}-${g.reqId}`}>จัด {g.text} เข้า</label>
            <select id={`ug-${g.assessmentId}-${g.reqId}`} defaultValue="" onChange={(e) => e.target.value && void run(() => api('POST', '/api/scouter?action=move', { gaps: [key(g)], itemId: e.target.value }))} className="h-10 max-w-[240px] rounded-full border border-line-strong bg-surface text-sm">
              <option value="">จัดเข้า…</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.id} {it.title}</option>)}
            </select>
            <Button variant="ghost" onClick={() => void run(() => api('POST', '/api/scouter?action=new', { title: g.text.slice(0, 80), need: g.gap.slice(0, 300), type: g.s === 'integ' ? 'INTEGRATION' : g.s === 'custom' ? 'ENHANCEMENT' : 'NEW_FEATURE', module: g.module, gaps: [key(g)] }))}>สร้างใหม่</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One need in full, as in the mockup's drawer: what customers want, where it stands, and every TOR that asked for it. Admins edit it here. */
function NeedDrawer({ row, items, admin, onClose, onChanged, onError }: { row: Row; items: ScoutItem[]; admin: boolean; onClose: () => void; onChanged: () => Promise<void>; onError: (m: string) => void }) {
  const { it, m, gaps } = row
  const close = useRef<HTMLButtonElement>(null)
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ title: it.title, need: it.need, type: it.type, module: it.module })
  const [into, setInto] = useState('')
  useEffect(() => { close.current?.focus() }, [])
  useEffect(() => { setForm({ title: it.title, need: it.need, type: it.type, module: it.module }) }, [it])
  const run = async (fn: () => Promise<unknown>, after?: () => void) => { try { await fn(); await onChanged(); after?.() } catch (e) { onError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') } }
  const byTor = [...new Map(gaps.map((g) => [g.assessmentId, gaps.filter((x) => x.assessmentId === g.assessmentId)])).values()]

  return (
    <div className="fixed inset-0 z-50" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div aria-hidden className="fade-in absolute inset-0 bg-ink/20" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="sd-title" className="slide-in absolute inset-y-2.5 right-2.5 flex w-[min(580px,calc(100%-20px))] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="flex items-start gap-3 px-6 pb-4 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13.5px] text-muted"><span className="font-mono">{it.id}</span><span>{TYPE_LABEL[it.type]}</span>{it.module && <span>{it.module}</span>}</div>
            <h2 id="sd-title" className="m-0 text-2xl font-semibold leading-snug tracking-[-0.025em] text-ink wrap-anywhere">{it.title}</h2>
          </div>
          <button ref={close} type="button" aria-label="ปิด" onClick={onClose} className="inline-flex size-10 flex-none items-center justify-center rounded-full border-0 bg-tint text-ink hover:bg-line"><X size={18} aria-hidden /></button>
        </div>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6 pt-1">
          {edit ? (
            <section aria-label="แก้ไขความต้องการ" className="flex flex-col gap-3 rounded-inner border border-line p-4">
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">ชื่อ</span><input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} className="h-11 rounded-lg border border-line-strong px-3" /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">ลูกค้าต้องการอะไร</span><textarea rows={2} value={form.need} maxLength={300} onChange={(e) => setForm({ ...form, need: e.target.value })} className="rounded-lg border border-line-strong px-3 py-2" /></label>
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-1 flex-col gap-1 text-sm"><span className="font-medium">ประเภท</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ScoutType })} className="h-11 rounded-lg border border-line-strong">{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
                <label className="flex flex-1 flex-col gap-1 text-sm"><span className="font-medium">หมวด</span><input value={form.module} maxLength={80} onChange={(e) => setForm({ ...form, module: e.target.value })} className="h-11 rounded-lg border border-line-strong px-3" /></label>
              </div>
              <div className="flex gap-2"><Button variant="primary" disabled={!form.title.trim()} onClick={() => void run(() => api('PATCH', '/api/scouter', { id: it.id, ...form }), () => setEdit(false))}>บันทึก</Button><Button variant="ghost" onClick={() => setEdit(false)}>ยกเลิก</Button></div>
            </section>
          ) : (
            <section className="flex flex-col gap-1.5">
              <h3 className="m-0 text-[13px] font-medium text-muted">ความต้องการของลูกค้า</h3>
              <p className="m-0 text-[15.5px] leading-7 text-ink">{it.need || '–'}</p>
              {admin && <div><Button variant="ghost" onClick={() => setEdit(true)}>แก้ไข</Button></div>}
            </section>
          )}
          <section className="flex flex-col gap-1.5">
            <h3 className="m-0 text-[13px] font-medium text-muted">สถานะฝั่ง Product</h3>
            <p className="m-0 inline-flex items-center gap-2 font-medium text-ink"><StatusDot s={it.status} />{STATUS_LABEL[it.status]}</p>
          </section>
          <dl className="m-0 grid grid-cols-3 gap-4">
            {[[String(m.tors), 'TOR ที่ขอ'], [money(m.deal), 'มูลค่าดีลรวม'], [money(m.lost), 'ดีลที่แพ้เพราะขาดฟีเจอร์']].map(([n, l]) => (
              <div key={l} className="flex flex-col-reverse"><dt className="text-[13px] text-muted">{l}</dt><dd className="m-0 text-[26px] font-semibold leading-tight tracking-[-0.04em] text-ink tabular-nums">{n}</dd></div>
            ))}
          </dl>
          <section className="flex flex-col">
            <h3 className="m-0 mb-1 text-[13px] font-medium text-muted">ถูกขอจาก</h3>
            {byTor.map((t) => (
              <div key={t[0].assessmentId} className="flex flex-col gap-1.5 border-t border-line py-4">
                <div className="flex flex-wrap justify-between gap-2 text-[13.5px] text-muted"><b className="text-[15px] font-semibold text-ink">{t[0].customer || '–'}</b><span>{[t[0].industry, fmtDate(t[0].due || t[0].createdAt)].filter(Boolean).join(', ')}</span></div>
                <p className="m-0 text-[13.5px] text-muted">
                  {t[0].tor} · ดีล {money(t[0].deal)} · {DEAL_LABEL[t[0].dealResult]}
                  {t.some((g) => g.lostBecause) && <span className="ml-1.5 rounded-full bg-[var(--st-none-bg)] px-2 py-px text-xs font-medium text-[var(--st-none-fg)]">แพ้เพราะขาดฟีเจอร์นี้</span>}
                </p>
                {t.map((g) => (
                  <div key={g.reqId} className="flex flex-col gap-1">
                    <p className="m-0 text-ink wrap-anywhere">
                      {g.text}
                      {g.mandatory && <span className="ml-1.5 rounded-full bg-ink px-2 py-px align-[2px] text-xs font-medium text-inverse">ข้อบังคับ</span>}
                      {!g.confirmed && <span className="ml-1.5 rounded-full border border-line-strong px-2 py-px align-[2px] text-xs text-muted">รอ PM ยืนยัน</span>}
                    </p>
                    {g.gap && <p className="m-0 text-[13.5px] text-muted">ขาด: {g.gap}</p>}
                    {admin && (
                      <span className="flex items-center gap-2 text-sm">
                        <label className="sr-only" htmlFor={`mv-${g.assessmentId}-${g.reqId}`}>ย้าย {g.text} ไป</label>
                        <select id={`mv-${g.assessmentId}-${g.reqId}`} defaultValue="" onChange={(e) => { const v = e.target.value; if (v) void run(() => api('POST', '/api/scouter?action=move', { gaps: [key(g)], itemId: v === 'none' ? null : v })) }} className="h-9 rounded-full border border-line-strong bg-surface text-xs">
                          <option value="">ย้ายไป…</option>
                          {items.filter((x) => x.id !== it.id).map((x) => <option key={x.id} value={x.id}>{x.id} {x.title}</option>)}
                          <option value="none">ยังไม่ได้จัดกลุ่ม</option>
                        </select>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>
          {admin && items.length > 1 && (
            <section aria-label="รวมกับรายการอื่น" className="flex flex-col gap-2 rounded-inner border border-line p-4">
              <h3 className="m-0 text-[15px] font-semibold text-ink">รวมกับรายการอื่น</h3>
              <p className="m-0 text-sm text-muted">ใช้เมื่อเป็นเรื่องเดียวกัน ข้อทั้งหมดของรายการนี้จะย้ายไปอยู่รายการที่เลือก แล้วรายการนี้จะหายไป</p>
              <div className="flex flex-wrap gap-2">
                <label className="sr-only" htmlFor="merge-into">รวมเข้ากับ</label>
                <select id="merge-into" value={into} onChange={(e) => setInto(e.target.value)} className="h-10 min-w-0 flex-1 rounded-full border border-line-strong bg-surface text-sm">
                  <option value="">เลือกรายการ…</option>
                  {items.filter((x) => x.id !== it.id).map((x) => <option key={x.id} value={x.id}>{x.id} {x.title}</option>)}
                </select>
                <Button disabled={!into} onClick={() => void run(() => api('POST', '/api/scouter?action=merge', { from: it.id, into }), onClose)}>รวมเข้าด้วยกัน</Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
