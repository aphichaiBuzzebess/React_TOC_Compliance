import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Pencil } from 'lucide-react'
import { hasAi, useAssessmentStore } from '@/store/useAssessmentStore'
import { MAX_TARGETS, UNKNOWN, activeServices, activeSolutions, serviceLabel, solutionLabel } from '@/data/taxonomy'
import { ALL_CATEGORIES, COMMERCIAL, isCommercial, orderedModules } from '@/data/categories'
import type { Priority, RawReq, Target } from '@/lib/types'
import { Button } from '@/components/ui'
import { ProcessOverlay } from '@/components/tor'
import { cn } from '@/lib/utils'

const pick = 'h-10 min-w-0 flex-1 rounded-full border border-line-strong bg-surface text-sm'
const first = (r: RawReq): Target => r.targets?.[0] ?? { solution: UNKNOWN, service: UNKNOWN }
const unplaced = (r: RawReq) => !isCommercial(r) && (first(r).solution === UNKNOWN || first(r).service === UNKNOWN)
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' })

/** What the system is not sure of, until a person has looked: unclear wording, a guessed priority, no solution or service. */
export const needsLook = (r: RawReq) => !r.seen && !isCommercial(r) && (!!r.amb || !!r.inf || unplaced(r))
const lookTag = (r: RawReq) => (r.amb ? 'ข้อความไม่ชัด' : r.inf ? 'ระบบเดาว่าบังคับ' : 'ยังไม่ระบุ solution')
const lookNote = (r: RawReq) =>
  r.amb ? r.amb : r.inf ? `TOR ไม่ได้บอกว่า "ต้อง" หรือ "ควร" ระบบเดาว่า${r.pri === 'O' ? 'ไม่บังคับ' : 'บังคับ'}` : 'ระบบจัด solution หรือ service ไม่ได้ เลือกเองก่อนเทียบ'

function TargetEditor({ r }: { r: RawReq }) {
  const { setTargets, taxonomy: tx } = useAssessmentStore()
  const targets = r.targets ?? [{ solution: UNKNOWN, service: UNKNOWN }]
  const set = (i: number, patch: Partial<Target>) => setTargets(r.id, targets.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  return (
    <div className="flex flex-col gap-2">
      {targets.map((t, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`${r.id}-z${i}`}>Solution ของ {r.id} ตัวที่ {i + 1}</label>
          <select id={`${r.id}-z${i}`} value={t.solution} onChange={(e) => set(i, { solution: e.target.value })} className={pick}>
            {[...activeSolutions(tx), ...tx.solutions.filter((z) => z.archived && z.id === t.solution)].map((z) => <option key={z.id} value={z.id}>{z.label}{z.archived ? ' (เก็บแล้ว)' : ''}</option>)}
            <option value={UNKNOWN}>ไม่ทราบ solution</option>
          </select>
          <label className="sr-only" htmlFor={`${r.id}-s${i}`}>Service ของ {r.id} ตัวที่ {i + 1}</label>
          <select id={`${r.id}-s${i}`} value={t.service} onChange={(e) => set(i, { service: e.target.value })} className={pick}>
            {[...activeServices(tx), ...tx.services.filter((s) => s.archived && s.id === t.service)].map((s) => <option key={s.id} value={s.id}>{s.label}{s.archived ? ' (เก็บแล้ว)' : s.confirmed ? '' : ' (ยังไม่ยืนยัน)'}</option>)}
            <option value={UNKNOWN}>ไม่ระบุ service</option>
          </select>
          {targets.length > 1 && <Button variant="ghost" aria-label={`เอา target ที่ ${i + 1} ของ ${r.id} ออก`} onClick={() => setTargets(r.id, targets.filter((_, j) => j !== i))}>เอาออก</Button>}
        </div>
      ))}
      {targets.length < MAX_TARGETS && <div><Button variant="ghost" onClick={() => setTargets(r.id, [...targets, { solution: UNKNOWN, service: UNKNOWN }])}>+ เพิ่ม target</Button></div>}
    </div>
  )
}

/** Bang-khap / mai bang-khap as a two-button switch. */
function PriSwitch({ value, onChange, label }: { value: Priority; onChange: (p: Priority) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-line p-1">
      {(['M', 'O'] as const).map((p) => (
        <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)} className={cn('h-8 rounded-full border-0 px-4 text-sm transition-colors', value === p ? 'bg-surface font-semibold text-ink shadow-sm' : 'bg-transparent text-muted hover:text-ink')}>
          {p === 'M' ? 'บังคับ' : 'ไม่บังคับ'}
        </button>
      ))}
    </div>
  )
}

const catOptions = (cur: string) => [...ALL_CATEGORIES, ...(ALL_CATEGORIES.includes(cur) ? [] : [cur])]

function EditRow({ r, onDone, onDelete }: { r: RawReq; onDone: () => void; onDelete: () => void }) {
  const { editReq, setWantsApi } = useAssessmentStore()
  const [text, setText] = useState(r.text)
  const [module, setModule] = useState(r.module)
  const [pri, setPri] = useState<Priority>(r.pri ?? 'M')
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { area.current?.focus() }, [])
  const save = () => { editReq(r.id, { text, module, pri }); onDone() }
  return (
    <div id={`re-${r.id}`} className="my-1 grid grid-cols-1 gap-3.5 rounded-2xl bg-tint px-3 py-3.5 sm:-mx-3 sm:grid-cols-[56px_minmax(0,1fr)]">
      <span className="font-mono text-[13px] text-muted sm:pt-3">{r.id}</span>
      <div className="flex min-w-0 flex-col gap-3">
        {needsLook(r) && <p className="m-0 text-[13.5px] text-amber-text">{lookTag(r)}: {lookNote(r)}</p>}
        <label className="sr-only" htmlFor={`ed-${r.id}`}>ข้อความ {r.id}</label>
        <textarea ref={area} id={`ed-${r.id}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} className="rounded-xl border border-line-strong px-3 py-2 text-[15px] leading-7" />
        {r.orig && <p className="m-0 text-[13px] text-muted">ใน TOR: {r.orig}</p>}
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor={`ec-${r.id}`}>หมวดของ {r.id}</label>
          <select id={`ec-${r.id}`} value={module} onChange={(e) => setModule(e.target.value)} className="h-10 rounded-full border border-line-strong text-sm">
            {catOptions(r.module).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <PriSwitch value={pri} onChange={setPri} label={`ระดับของ ${r.id}`} />
        </div>
        {module !== COMMERCIAL && (
          <>
            <TargetEditor r={r} />
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" checked={r.wantsApi === true} onChange={(e) => setWantsApi(r.id, e.target.checked)} className="size-5" />
              <span>ขอ API · ลูกค้าสร้างระบบเองแทน tool ของเรา (ต้องถาม Tech)</span>
            </label>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="ghost" className="text-danger" onClick={onDelete}>ลบข้อนี้</Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onDone}>ยกเลิก</Button>
          <Button variant="primary" onClick={save}>บันทึก</Button>
        </div>
      </div>
    </div>
  )
}

function ViewRow({ r, onEdit }: { r: RawReq; onEdit: () => void }) {
  const tx = useAssessmentStore((s) => s.taxonomy)
  const flag = needsLook(r)
  const places = (r.targets ?? []).map((t) => (t.service === UNKNOWN ? (t.solution === UNKNOWN ? '' : solutionLabel(t.solution, tx)) : `${solutionLabel(t.solution, tx)} › ${serviceLabel(t.service, tx)}`)).filter(Boolean)
  return (
    <button
      type="button"
      id={`rr-${r.id}`}
      onClick={onEdit}
      aria-label={`${r.id} ${r.text} คลิกเพื่อแก้ไข`}
      className="group relative grid w-full grid-cols-[44px_minmax(0,1fr)] items-baseline gap-x-3.5 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-tint sm:-mx-3 sm:w-[calc(100%+24px)] sm:grid-cols-[56px_minmax(0,1fr)_auto_18px]"
    >
      {flag && <span aria-hidden className="absolute -left-1.5 top-[19px] size-[7px] rounded-full bg-amber" />}
      <span className="font-mono text-[13px] text-muted">{r.id}</span>
      <span className="min-w-0 text-[15.5px] leading-relaxed text-ink wrap-anywhere">
        {r.text}
        {r.pri === 'O' && <span className="ml-2.5 whitespace-nowrap rounded-full border border-line-strong px-2 py-px align-[1px] text-[12.5px] text-muted">ไม่บังคับ</span>}
        {flag && <span className="mt-0.5 block text-[13.5px] text-amber-text">{lookNote(r)}</span>}
        {!isCommercial(r) && (places.length > 0 || r.wantsApi) && (
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
            {places.map((p) => <span key={p}>{p}</span>)}
            {r.wantsApi && <span className="font-medium text-danger">ขอ API · ถาม Tech</span>}
          </span>
        )}
      </span>
      <span className="col-start-2 whitespace-nowrap text-[13.5px] text-muted sm:col-start-auto">{r.ref}</span>
      <Pencil aria-hidden size={15} className="hidden self-center text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block" />
    </button>
  )
}

export default function Review() {
  const nav = useNavigate()
  const { review, running, step, error, detail, confirmReview, clearReview, removeReq, restoreReq, addReq, customer, project, scope } = useAssessmentStore()
  const aiReady = useAssessmentStore(hasAi)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ text: '', module: 'อื่น ๆ', pri: 'M' as Priority })
  const [undo, setUndo] = useState<{ r: RawReq; at: number } | null>(null)
  const [asking, setAsking] = useState<'confirm' | 'clear' | null>(null)

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  if (!review) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-6 py-20 text-center">
        <p className="m-0 text-3xl tracking-[-0.03em] text-ink">ยังไม่มี requirement รอตรวจ</p>
        <p className="m-0 max-w-sm text-muted">อัปโหลด TOR แล้วกด "แยก Requirement" ระบบจะแยกข้อและจัดหมวดให้ แล้วมาหยุดที่หน้านี้</p>
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber px-5 text-sm font-semibold text-on-amber no-underline hover:bg-amber-hover">อัปโหลด TOR <span aria-hidden>→</span></Link>
      </div>
    )
  }

  const product = review.filter((r) => !isCommercial(r))
  const terms = review.filter(isCommercial)
  const cats = orderedModules(review)
  const productCats = cats.filter((c) => c !== COMMERCIAL)
  const look = review.filter(needsLook)
  const industry = [project.industry, project.sub, project.leaf].filter((x, i, xs) => x && x !== xs[i - 1]).join(' › ')
  const meta = [customer, industry, project.due && `ยื่น ${fmtDate(project.due)}`].filter(Boolean)

  const edit = (id: string) => {
    setEditing(id)
    setAdding(false)
    requestAnimationFrame(() => document.getElementById(`re-${id}`)?.scrollIntoView?.({ block: 'center' }))
  }
  const done = (id: string) => {
    setEditing(null)
    requestAnimationFrame(() => document.getElementById(`rr-${id}`)?.focus({ preventScroll: true }))
  }
  const remove = (id: string) => {
    setEditing(null)
    setUndo(removeReq(id))
  }
  const saveAdd = () => {
    if (!draft.text.trim()) return document.getElementById('add-text')?.focus()
    addReq(draft.text, draft.module, draft.pri)
    setDraft({ text: '', module: 'อื่น ๆ', pri: 'M' })
    setAdding(false)
  }
  const confirm = async () => {
    setAsking(null)
    await confirmReview()
    if (useAssessmentStore.getState().result) nav('/summary')
  }

  return (
    <div className="flex flex-col gap-2 pb-32">
      {/* The same top as a result page (ResultHead): the way back, then what TOR this is. */}
      <div className="flex flex-col gap-3 pb-6">
        <Link to="/history" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted no-underline hover:text-ink">
          <ChevronLeft size={16} aria-hidden /> TOR ทั้งหมด
        </Link>
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-0.5 text-sm text-muted">
            <span className="inline-flex items-center gap-3"><span aria-hidden className="flex gap-1"><i className="block h-1 w-7 rounded-full bg-ink" /><i className="block h-1 w-7 rounded-full bg-line-strong" /></span>ขั้นที่ 1 จาก 2 · ตรวจ requirement</span>
            {meta.map((m) => <span key={m}>{m}</span>)}
          </div>
          <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink wrap-anywhere sm:text-[34px]">{project.title || customer || 'TOR'}</h1>
        </header>
      </div>

      <section aria-label="สรุป TOR" className="grid gap-6 pb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-14">
        <div className="flex min-w-0 flex-col">
          <p className="m-0 mb-2 text-[13.5px] text-muted">TOR นี้ต้องการ</p>
          <p className="m-0 max-w-[40ch] text-[19px] font-medium leading-normal tracking-[-0.015em] text-ink sm:text-[22px]">{scope || 'ยังไม่มีสรุป'}</p>
          <p className="m-0 mb-2 mt-6 text-[13.5px] text-muted">
            ขอเรื่องอะไรบ้าง <span className="ml-2 text-ink">{product.length} ข้อ ใน {productCats.length} หมวด · ข้อบังคับ {product.filter((r) => r.pri !== 'O').length}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {productCats.map((c) => (
              <button key={c} type="button" onClick={() => document.getElementById(`g-${ALL_CATEGORIES.indexOf(c)}-${c.length}`)?.scrollIntoView?.({ block: 'start' })} className="inline-flex h-[34px] items-center gap-2 rounded-full border border-line-strong bg-surface pl-3.5 pr-1.5 text-sm transition-colors hover:border-ink">
                {c}
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-tint px-1.5 text-[12.5px] font-semibold tabular-nums">{review.filter((r) => r.module === c).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="m-0 mb-2 text-[13.5px] text-muted">เงื่อนไขสัญญา</p>
          {terms.length ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {terms.map((r) => <li key={r.id} className="text-[15px] font-medium leading-normal text-ink">{r.text}{r.ref && <span className="block text-[13px] font-normal text-muted">{r.ref}</span>}</li>)}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted">ไม่พบใน TOR</p>
          )}
        </div>
      </section>

      <section aria-labelledby="look-h" className={cn('rounded-card px-5 pb-3 pt-5', look.length ? 'bg-amber-soft' : 'bg-[var(--st-full-bg)] pb-5')}>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="look-h" className={cn('m-0 text-[17px] font-semibold tracking-[-0.01em]', look.length ? 'text-ink' : 'text-[var(--st-full-fg)]')}>{look.length ? `ต้องดูก่อนยืนยัน ${look.length} ข้อ` : 'ดูครบทุกข้อที่ระบบไม่มั่นใจแล้ว'}</h2>
          <p className={cn('m-0 text-sm', look.length ? 'text-amber-text' : 'text-[var(--st-full-fg)]')}>{look.length ? 'ระบบไม่มั่นใจข้อเหล่านี้ คลิกเพื่อแก้หรือกดบันทึกว่าตรวจแล้ว' : 'พร้อมยืนยันได้เลย'}</p>
        </div>
        {look.length > 0 && (
          <ul className="m-0 list-none p-0">
            {look.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => edit(r.id)} className="-mx-2.5 grid w-[calc(100%+20px)] grid-cols-[44px_minmax(0,1fr)] items-baseline gap-2.5 rounded-xl border-0 bg-transparent p-2.5 text-left transition-colors hover:bg-surface/70 sm:grid-cols-[150px_52px_minmax(0,1fr)]">
                  <span className="col-span-2 text-[12.5px] font-semibold text-amber-text sm:col-span-1">{lookTag(r)}</span>
                  <span className="font-mono text-[13px] text-muted">{r.id}</span>
                  <span className="text-[15px] text-ink wrap-anywhere">{r.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-7 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">Requirement ทั้งหมด</h2>
        <p className="m-0 text-sm text-muted">คลิกที่ข้อเพื่อแก้ข้อความ ย้ายหมวด เปลี่ยนเป็นไม่บังคับ หรือเลือก solution</p>
      </div>
      {cats.map((c) => {
        const items = review.filter((r) => r.module === c)
        return (
          <section key={c} id={`g-${ALL_CATEGORIES.indexOf(c)}-${c.length}`} aria-label={c} className="mt-3.5 scroll-mt-24 border-t border-line pb-1 pt-5">
            <div className="mb-1 flex flex-wrap items-baseline gap-2.5">
              <h2 className="m-0 text-[15px] font-semibold text-ink">{c}</h2>
              <span className="text-sm text-muted">{items.length}</span>
              {c === COMMERCIAL && <p className="m-0 text-[13.5px] text-muted sm:ml-auto">ไม่ใช่ฟีเจอร์ product จึงไม่เทียบกับ KB ให้ BD ตรวจเอง</p>}
            </div>
            {items.map((r) => (editing === r.id ? <EditRow key={r.id} r={r} onDone={() => done(r.id)} onDelete={() => remove(r.id)} /> : <ViewRow key={r.id} r={r} onEdit={() => edit(r.id)} />))}
          </section>
        )
      })}

      {adding ? (
        <div className="mt-5 grid grid-cols-1 gap-3.5 rounded-2xl bg-tint px-3 py-3.5 sm:-mx-3 sm:grid-cols-[56px_minmax(0,1fr)]">
          <span className="font-mono text-[13px] text-muted sm:pt-3">ใหม่</span>
          <div className="flex flex-col gap-3">
            <label className="sr-only" htmlFor="add-text">Requirement ใหม่</label>
            <input id="add-text" autoFocus value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveAdd()} placeholder="เช่น ระบบต้องส่ง SMS แจ้งคะแนนหลังซื้อ" className="h-11 rounded-xl border border-line-strong px-3 text-[15px]" />
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="sr-only" htmlFor="add-cat">หมวด</label>
              <select id="add-cat" value={draft.module} onChange={(e) => setDraft({ ...draft, module: e.target.value })} className="h-10 rounded-full border border-line-strong text-sm">
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <PriSwitch value={draft.pri} onChange={(pri) => setDraft({ ...draft, pri })} label="ระดับของข้อใหม่" />
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setAdding(false)}>ยกเลิก</Button>
              <Button variant="primary" onClick={saveAdd}>เพิ่ม</Button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setAdding(true); setEditing(null) }} className="mt-3.5 w-full border-0 border-t border-line bg-transparent pt-4 text-left font-medium text-muted hover:text-ink">+ เพิ่ม requirement</button>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
        {asking === 'clear' ? (
          <span role="alert" className="flex flex-wrap items-center gap-2">
            ล้าง {review.length} ข้อนี้ทิ้ง? ต้องรันใหม่จากไฟล์ TOR
            <Button variant="danger" onClick={() => { clearReview(); nav('/') }}>ล้างเลย</Button>
            <Button variant="ghost" onClick={() => setAsking(null)}>ยกเลิก</Button>
          </span>
        ) : (
          <Button variant="ghost" disabled={running} onClick={() => setAsking('clear')}>ล้างรายการ review</Button>
        )}
      </div>

      {running && <ProcessOverlay title="กำลังเทียบกับ Knowledge Base" steps={['ค้น note ที่เกี่ยวข้องใน KB', `ตัดสินผลทีละข้อ (${product.length} ข้อ)`, 'คำนวณผลและเขียนสรุป']} at={step - 2} detail={detail} />}

      {undo && (
        <div role="status" className="rise-in fixed bottom-28 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full bg-dark px-5 py-2.5 text-sm text-dark-ink shadow-lg">
          ลบ {undo.r.id} แล้ว
          <button type="button" onClick={() => { restoreReq(undo.r, undo.at); setUndo(null) }} className="border-0 bg-transparent font-semibold text-amber underline underline-offset-4">เลิกทำ</button>
        </div>
      )}

      {/* The way forward stays in view: how many still need a look, and the confirm. */}
      <div className="rise-in fixed inset-x-3 bottom-6 z-20 flex flex-col gap-2 rounded-card bg-dark px-5 py-2 text-sm text-dark-muted shadow-[0_16px_48px_rgba(0,0,0,0.22)] sm:inset-x-auto sm:left-1/2 sm:max-w-[calc(100%-32px)] sm:-translate-x-1/2 sm:rounded-full sm:py-[7px] sm:pl-6 sm:pr-[7px]">
        {error && <p role="alert" className="m-0 pt-1 text-dark-danger">{error}</p>}
        <div className="flex items-center gap-5">
          {running ? (
            <p className="m-0 min-w-0 flex-1">{detail || 'กำลังเทียบกับ KB…'}</p>
          ) : asking === 'confirm' ? (
            <p role="alert" className="m-0 min-w-0 flex-1">ยังมี <b className="text-dark-ink">{look.length} ข้อ</b> ที่ควรดูก่อน: {look.map((r) => r.id).join(', ')}</p>
          ) : !aiReady ? (
            <p className="m-0 min-w-0 flex-1">ต้องตั้งค่า AI ก่อนที่ <Link to="/ai-settings" className="font-semibold text-amber underline">AI settings</Link></p>
          ) : (
            <p className="m-0 min-w-0 flex-1">{look.length ? <>ยังมี <b className="text-dark-ink">{look.length} ข้อ</b> ที่ควรดูก่อน</> : <>ยืนยันแล้วระบบจะเทียบ <b className="text-dark-ink">{product.length} ข้อ</b> กับ KB</>}</p>
          )}
          {asking === 'confirm' && !running ? (
            <span className="flex flex-none gap-2">
              <button type="button" onClick={() => { setAsking(null); if (look[0]) edit(look[0].id) }} className="h-10 rounded-full border border-dark-edge bg-transparent px-4 font-semibold text-dark-ink">กลับไปดู</button>
              <button type="button" onClick={confirm} className="h-10 rounded-full border-0 bg-dark-ink px-4 font-semibold text-[var(--c-dark)]">ยืนยันเลย</button>
            </span>
          ) : (
            <button type="button" disabled={running || !aiReady || product.length === 0} onClick={() => (look.length ? setAsking('confirm') : confirm())} className="h-10 flex-none rounded-full border-0 bg-dark-ink px-4 font-semibold text-[var(--c-dark)] disabled:cursor-not-allowed disabled:opacity-50">
              {running ? 'กำลังประเมิน…' : 'ยืนยันและเริ่มเทียบ'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
