import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronLeft, ChevronRight, FileText, X } from 'lucide-react'
import { ORDER, STATUS } from '@/data/tor'
import { UNKNOWN, serviceLabel, solutionLabel } from '@/data/taxonomy'
import { features } from '@/lib/evidence'
import { VERDICT, groupOf, type VerdictKey } from '@/lib/verdict'
import type { Req, StatusKey } from '@/lib/types'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

/** A status: a dot in its colour and the Thai name. "ต้องตรวจสอบ" is an outlined dot. */
export function St({ s, className }: { s: StatusKey; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap text-sm', className)}>
      <Dot s={s} />
      {STATUS[s].th}
    </span>
  )
}
export function Dot({ s, size = 8 }: { s: StatusKey; size?: number }) {
  const style: CSSProperties = s === 'verify' ? { boxShadow: `inset 0 0 0 2px ${STATUS[s].dot}` } : { background: STATUS[s].dot }
  return <i aria-hidden className="inline-block flex-none rounded-full" style={{ width: size, height: size, ...style }} />
}

/** The verdict: a dot with a soft halo, and its name. */
export function Verdict({ v, className, muted = false }: { v: VerdictKey; className?: string; muted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-semibold', muted ? 'font-medium text-muted' : 'text-ink', className)}>
      <i aria-hidden className="inline-block size-2.5 flex-none rounded-full" style={{ background: VERDICT[v].tone, boxShadow: `0 0 0 4px color-mix(in srgb, ${VERDICT[v].tone} 20%, transparent)` }} />
      {VERDICT[v].label}
    </span>
  )
}

/** One bar's look: colour by status; an optional requirement is half as tall and paler; "ต้องตรวจสอบ" is an outline. */
export function barStyle(s: StatusKey, optional: boolean): CSSProperties {
  const c = STATUS[s].dot
  if (s === 'verify') return { boxShadow: `inset 0 0 0 1.5px ${optional ? `color-mix(in srgb, ${c} 50%, var(--color-surface))` : c}`, background: 'transparent', height: optional ? '52%' : '100%' }
  return { background: optional ? `color-mix(in srgb, ${c} 42%, var(--color-surface))` : c, height: optional ? '52%' : '100%' }
}
/** A mandatory requirement the product does not support: the deal breakers get a dot above the bar. */
export const dealBreaker = (r: Pick<Req, 's' | 'pri'>) => r.s === 'none' && r.pri !== 'O'

/** Bars that only show (the list page): no buttons. */
export function StaticBars({ bars, className }: { bars: { s: StatusKey; o: boolean }[]; className?: string }) {
  return (
    <span aria-hidden className={cn('flex min-w-0 items-end gap-[3px] overflow-hidden', className)}>
      {bars.map((b, i) => <i key={i} className="block min-w-[3px] max-w-[5px] flex-1 rounded-full" style={barStyle(b.s, b.o)} />)}
    </span>
  )
}

/** Bars that open a requirement. `size` is the height in px; `width` a fixed bar width (any CSS length), else bars share the row. */
/**
 * The tooltip of a bar, as in the mockup: dark, above the bar (below it when there is no room), with the requirement and its
 * status. It is decorative: the bar's own label already says the same to screen readers.
 */
function BarTip({ r, at }: { r: Req; at: DOMRect }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(at.left + at.width / 2 - w / 2, window.innerWidth - w - 8))
    const above = at.top - h - 12
    setPos({ left, top: above < 70 ? at.bottom + 10 : above }) // under the sticky header there is no room: show it below
  }, [at])
  return createPortal(
    <div
      ref={box}
      aria-hidden
      data-bar-tip
      className="pointer-events-none fixed z-[70] max-w-[320px] rounded-xl bg-dark px-3 py-2 text-[13.5px] leading-normal text-dark-ink shadow-lg transition-[opacity,transform] duration-100"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, opacity: pos ? 1 : 0, transform: pos ? 'none' : 'translateY(4px)' }}
    >
      <b className="font-semibold">{r.id}</b>&ensp;{r.text}
      <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-dark-muted">
        <Dot s={r.s} size={7} />
        {STATUS[r.s].th}{r.pri === 'O' ? ', ไม่บังคับ' : ', ข้อบังคับ'}
      </span>
    </div>,
    document.body,
  )
}

/** `grow`: the bars grow in one after another, counting from `from` (so several rows can run as one wave). */
export function BarButtons({ reqs, onOpen, size = 120, width, gap = 4, grow = false, from = 0, label = (r) => r.text }: { reqs: Req[]; onOpen: (id: string) => void; size?: number; width?: string; gap?: number; grow?: boolean; from?: number; label?: (r: Req) => string }) {
  const [tip, setTip] = useState<{ r: Req; at: DOMRect } | null>(null)
  useEffect(() => {
    if (!tip) return
    const hide = () => setTip(null) // it is placed for where the bar was: a scroll would leave it behind
    window.addEventListener('scroll', hide, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', hide, { capture: true })
  }, [tip])
  return (
    <div className={cn('group/bars flex min-w-0 items-end pt-3', grow && 'bars-grow')} style={{ height: size, gap }}>
      {tip && <BarTip r={tip.r} at={tip.at} />}
      {reqs.map((r, i) => (
        <button
          key={r.id}
          type="button"
          onClick={() => { setTip(null); onOpen(r.id) }}
          onMouseEnter={(e) => setTip({ r, at: e.currentTarget.getBoundingClientRect() })}
          onMouseLeave={() => setTip(null)}
          onFocus={(e) => setTip({ r, at: e.currentTarget.getBoundingClientRect() })}
          onBlur={() => setTip(null)}
          aria-label={`${r.id} ${label(r)}, ${STATUS[r.s].th}${r.pri !== 'O' ? ', ข้อบังคับ' : ''}`}
          className={cn('relative block cursor-pointer rounded-full border-0 p-0 transition group-hover/bars:opacity-40 hover:!opacity-100 hover:scale-y-105 focus-visible:!opacity-100', width ? 'flex-none' : 'min-w-[4px] max-w-[16px] flex-1')}
          style={{ ...barStyle(r.s, r.pri === 'O'), transformOrigin: 'bottom', ...(width && { width }), ['--i' as string]: from + i }}
        >
          {dealBreaker(r) && <span aria-hidden className="db-dot absolute -top-3 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-ink" />}
        </button>
      ))}
    </div>
  )
}

/**
 * A run in progress, over the page: the steps, a bar and a spinner on the current one (the mockup's process screen).
 * `at` is the index of the step running now; `detail` is what it is doing, announced to screen readers.
 */
export function ProcessOverlay({ title, steps, at, detail }: { title: string; steps: string[]; at: number; detail?: string }) {
  const cur = Math.min(Math.max(at, 0), steps.length - 1)
  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-canvas/85 backdrop-blur-md">
      <div role="dialog" aria-modal="true" aria-labelledby="proc-h" className="w-[min(480px,88vw)]">
        <h2 id="proc-h" className="m-0 text-[28px] font-semibold tracking-[-0.035em] text-ink">{title}</h2>
        <div aria-hidden className="my-6 h-[3px] overflow-hidden rounded-full bg-line">
          <i className="block h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${Math.max(6, ((cur + 0.5) / steps.length) * 100)}%` }} />
        </div>
        <ol className="m-0 flex list-none flex-col gap-3 p-0 text-[15px]">
          {steps.map((st, k) => (
            <li key={st} className={cn('flex items-center gap-3', k < cur ? 'text-ink' : k === cur ? 'font-medium text-ink' : 'text-muted')}>
              <span aria-hidden className="grid size-5 flex-none place-items-center">
                {k < cur ? <Check size={18} className="text-[var(--st-full-dot)]" /> : k === cur ? <span className="spin block size-4 rounded-full border-2 border-line border-t-ink" /> : <i className="block size-1.5 rounded-full bg-line-strong" />}
              </span>
              {st}
            </li>
          ))}
        </ol>
        {detail && <p role="status" className="m-0 mt-5 text-sm text-muted">{detail}</p>}
      </div>
    </div>
  )
}

const targetName = (t: { solution: string; service: string }, tx: ReturnType<typeof useAssessmentStore.getState>['taxonomy']) =>
  t.service === UNKNOWN ? solutionLabel(t.solution, tx) : `${solutionLabel(t.solution, tx)} › ${serviceLabel(t.service, tx)}`

function Sec({ h, children }: { h: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="m-0 text-[13px] font-medium text-muted">{h}</h3>
      {children}
    </section>
  )
}
const P = ({ v }: { v?: string }) => <p className="m-0 text-[15.5px] leading-7 text-ink wrap-anywhere">{v}</p>

/**
 * One requirement in full, over the page: the verdict, the TOR's own words, why, what is missing, what to do, what to ask,
 * and the features of ours it matches. A person can change the status (with a reason) and confirm or flag the result.
 * `ids` is the order prev/next walk through.
 */
export function ReqDrawer({ id, ids, onOpen, onClose }: { id: string; ids: string[]; onOpen: (id: string) => void; onClose: () => void }) {
  const r = useAssessmentStore((s) => s.result?.find((x) => x.id === id))
  const tx = useAssessmentStore((s) => s.taxonomy)
  const v = useAssessmentStore((s) => s.valid[id])
  const { select, validate, override } = useAssessmentStore()
  const close = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const [to, setTo] = useState<StatusKey | ''>('')
  const [note, setNote] = useState('')

  // Focus goes into the drawer when it opens and back where it came from when it closes.
  useEffect(() => {
    opener.current = document.activeElement
    return () => { (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    close.current?.focus()
    if (body.current) body.current.scrollTop = 0
    setTo('')
    setNote('')
  }, [id])
  if (!r) return null

  const at = ids.indexOf(id)
  const prev = at > 0 ? ids[at - 1] : undefined
  const next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined
  const mark = (value: 'ok' | 'flag') => {
    select(r.id)
    validate(value)
    if (next) onOpen(next)
  }
  const feats = features(r.evidence)
  const group = groupOf(r.s)

  return (
    <div className="fixed inset-0 z-50" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div aria-hidden className="fade-in absolute inset-0 bg-ink/20" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="d-title" className="slide-in absolute inset-y-2.5 right-2.5 flex w-[min(580px,calc(100%-20px))] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="flex items-start gap-3 px-6 pb-4 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13.5px] text-muted">
              <span className="font-mono">{r.id}</span>
              <span>{r.pri === 'O' ? 'ไม่บังคับ' : 'ข้อบังคับ'}</span>
              <span>{r.module}</span>
            </div>
            <h2 id="d-title" className="m-0 text-2xl font-semibold leading-snug tracking-[-0.025em] text-ink wrap-anywhere">{r.text}</h2>
          </div>
          <div className="flex flex-none items-center gap-1">
            {at >= 0 && <span className="px-1 text-xs tabular-nums text-muted">{at + 1} / {ids.length}</span>}
            <IconBtn label="ข้อก่อนหน้า" disabled={!prev} onClick={() => prev && onOpen(prev)}><ChevronLeft size={18} aria-hidden /></IconBtn>
            <IconBtn label="ข้อถัดไป" disabled={!next} onClick={() => next && onOpen(next)}><ChevronRight size={18} aria-hidden /></IconBtn>
            <IconBtn ref={close} label="ปิด" onClick={onClose}><X size={18} aria-hidden /></IconBtn>
          </div>
        </div>

        <div ref={body} className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6 pt-1">
          <Sec h="ผลการเทียบ">
            <div className="flex flex-wrap items-center gap-4">
              <St s={r.s} className="text-base font-semibold" />
              <span className="text-[13.5px] text-muted">ความมั่นใจ {r.conf}</span>
            </div>
            {r.override && <p className="m-0 text-sm text-ink">แก้โดย BD จากเดิม {STATUS[r.override.from].th}{r.override.note ? `: ${r.override.note}` : ''}</p>}
            <p className="m-0 text-xs leading-5 text-muted">{STATUS[r.s].hint}</p>
          </Sec>
          <Sec h="ข้อความใน TOR">
            <div className="border-l-2 border-ink py-0.5 pl-4 text-[15.5px] leading-7 wrap-anywhere">
              {r.orig || r.text}
              {r.ref && <small className="mt-1 block text-[13px] text-muted">{r.ref}</small>}
            </div>
          </Sec>
          {(r.targets?.length || r.wantsApi) && (
            <Sec h="Solution และ service">
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[15px]">{(r.targets ?? []).map((t) => <li key={`${t.solution}/${t.service}`}>{targetName(t, tx)}</li>)}</ul>
              {r.wantsApi && <p className="m-0 text-sm font-medium text-danger">ขอ API · ลูกค้าสร้างระบบเอง ต้องให้ Tech ตัดสินก่อนสรุปผล</p>}
            </Sec>
          )}
          {r.reason && <Sec h="เหตุผล"><P v={r.reason} /></Sec>}
          {r.gap && group !== 'ready' && <Sec h="ยังขาดอะไร"><P v={r.gap} /></Sec>}
          {r.rec && <Sec h="แนะนำให้ BD"><P v={r.rec} /></Sec>}
          {(r.q || r.amb) && <Sec h="คำถามถึงลูกค้า"><P v={r.q || r.amb} /></Sec>}
          <Sec h="ตรงกับ feature ของเรา">
            {feats.length ? (
              feats.map((f) => (
                <div key={`${f.module}/${f.title}`} className="flex flex-col gap-0.5 rounded-inner bg-tint px-4 py-3">
                  <b className="font-semibold text-ink">{f.title}</b>
                  <span className="flex items-center gap-1.5 text-[13px] text-muted"><FileText size={14} aria-hidden />KB › {f.module}</span>
                </div>
              ))
            ) : (
              <p className="m-0 text-muted">{r.evidence && !/ไม่พบหลักฐาน/.test(r.evidence) ? r.evidence : 'ไม่พบ note ที่เกี่ยวข้อง ควรเพิ่ม note เรื่องนี้ใน KB'}</p>
            )}
          </Sec>

          <section aria-labelledby="ov-h" className="flex flex-col gap-3 rounded-inner border border-line p-4">
            <h3 id="ov-h" className="m-0 text-[15px] font-semibold text-ink">เปลี่ยนผล</h3>
            <p className="m-0 text-sm text-muted">ใช้เมื่อ BD หรือ PM รู้ข้อมูลที่ KB ยังไม่มี ผลสรุปจะคำนวณใหม่ทันที</p>
            <label className="sr-only" htmlFor="ov-st">ผลใหม่</label>
            <select id="ov-st" value={to || r.s} onChange={(e) => setTo(e.target.value as StatusKey)} className="h-11 rounded-lg border border-line-strong text-sm">
              {ORDER.map((k) => <option key={k} value={k}>{STATUS[k].th} ({STATUS[k].label})</option>)}
            </select>
            <label className="sr-only" htmlFor="ov-note">เหตุผลที่เปลี่ยน</label>
            <textarea id="ov-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ทีม Product ยืนยันว่ามีใน release ธ.ค." className="rounded-lg border border-line-strong px-3 py-2 text-sm" />
            <div><Button disabled={!to || to === r.s} onClick={() => { override(r.id, to as StatusKey, note); setTo(''); setNote('') }}>บันทึกผล</Button></div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3">
          <span role="status" className={cn('text-sm', v === 'ok' ? 'text-success' : v === 'flag' ? 'text-danger' : 'text-muted')}>
            {v === 'ok' ? 'PM ยืนยันผลแล้ว' : v === 'flag' ? 'ติดธงให้ตรวจซ้ำ' : 'PM ยังไม่ได้ตรวจ'}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => mark('flag')}>ติดธง</Button>
            <Button variant="primary" arrow onClick={() => mark('ok')}>ยืนยันผล</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

const IconBtn = forwardRef<HTMLButtonElement, { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>>(({ label, className = '', ...p }, ref) => (
  <button ref={ref} type="button" aria-label={label} {...p} className={`inline-flex size-10 items-center justify-center rounded-full border-0 bg-tint text-ink transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-40 ${className}`} />
))
IconBtn.displayName = 'IconBtn'
