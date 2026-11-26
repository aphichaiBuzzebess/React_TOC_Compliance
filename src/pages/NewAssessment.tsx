import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Image as ImageIcon, Upload, X } from 'lucide-react'
import { activeAi, hasAi, useAssessmentStore } from '@/store/useAssessmentStore'
import { STEPS } from '@/data/tor'
import { AI_PROVIDERS } from '@/data/models'
import { industries, leafIndustries, subIndustries } from '@/data/industries'
import { useAssessment } from '@/lib/useAssessment'
import { score, scoreCounts } from '@/lib/verdict'
import { Button, Elapsed, PageHeader, metaLabel } from '@/components/ui'
import { cn } from '@/lib/utils'

const HoopDrop = lazy(() => import('@/components/HoopDrop')) // the game's code loads only when the mode is switched on
const HOOP_KEY = 'tor-scouter-hoop'
const readHoop = () => { try { return localStorage.getItem(HOOP_KEY) === '1' } catch { return false } }
const ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif'
const TYPES = ['PDF', 'Word', 'Excel', 'CSV', 'TXT', 'JPEG', 'PNG']
const SAMPLE = { url: '/samples/tor-sample.txt', name: 'TOR-ตัวอย่าง-ระบบสมาชิกร้านอาหาร.txt', title: 'TOR ระบบสมาชิกเครือร้านอาหาร', customer: 'บจก. ตัวอย่าง ฟู้ดส์' }
const RECENT = 3

const field = 'h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink disabled:cursor-not-allowed disabled:bg-tint disabled:text-muted'
const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' }) : '')

interface Recent { id: string; title: string; customer: string; due: string; counts: Record<string, number> }

/** The newest saved TORs (account mode). Nothing is shown until they load, and nothing on failure: this list is a shortcut, not the task. */
function useRecent(enabled: boolean): Recent[] {
  const [rows, setRows] = useState<Recent[]>([])
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetch('/api/history')
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((body) => live && setRows((body.entries ?? []).slice(0, RECENT)))
      .catch(() => undefined)
    return () => { live = false }
  }, [enabled])
  return enabled ? rows : []
}

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{children}</label>
}

export default function NewAssessment() {
  const nav = useNavigate()
  const last = useAssessment()
  const { step, running, startedAt, detail, error, files, draft, mode, user, addFiles, removeFile, setDraft, runReal, openHistory } = useAssessmentStore()
  // The form is a draft of the next TOR; the TOR on screen (Review, result) keeps its own details.
  const { customer, project } = draft
  const setCustomer = (c: string) => setDraft({ customer: c })
  const setProject = setDraft
  const lastTor = { title: useAssessmentStore((s) => s.project.title), customer: useAssessmentStore((s) => s.customer) } // the last TOR run, not the form
  const aiReady = useAssessmentStore(hasAi)
  const pending = useAssessmentStore((s) => s.review !== null) // classified, waiting for the BA to confirm solutions
  const use = useAssessmentStore(activeAi)
  const recent = useRecent(mode === 'account' && !!user)
  const [dragging, setDragging] = useState(false)
  const [hoop, setHoop] = useState(readHoop) // a per-browser toggle: the drop zone as a basketball shot
  const toggleHoop = () => { const v = !hoop; setHoop(v); try { localStorage.setItem(HOOP_KEY, v ? '1' : '0') } catch { /* private mode: the toggle still works for this visit */ } }
  const hasFiles = files.length > 0
  const ai = AI_PROVIDERS.find((p) => p.id === use?.provider)

  // A text-only AI (DeepSeek, BytePlus) cannot read a PDF or an image: say so before the run, not after a failed request.
  const unreadable = ai?.textOnly ? files.find((f) => (ai.images ? /\.pdf$/i : /\.(pdf|png|jpe?g|webp|gif)$/i).test(f.name)) : undefined
  const blocker = running ? null : !hasFiles && !aiReady ? 'เพิ่มไฟล์ TOR และตั้งค่า AI ก่อน' : !hasFiles ? 'เพิ่มไฟล์ TOR อย่างน้อย 1 ไฟล์' : !aiReady ? 'ตั้งค่า AI ก่อน' : unreadable ? `${ai?.label} อ่าน ${unreadable.name} ไม่ได้ ใช้ DOCX, XLSX, CSV, TXT${ai?.images ? ' หรือรูปภาพ' : ''} หรือเปลี่ยน AI` : null
  const hint = running ? null : (blocker ?? 'พร้อมแล้ว')

  const start = async () => {
    await runReal()
    if (useAssessmentStore.getState().review) nav('/review') // the run stops after classify: the BA confirms solutions next
  }
  const loadSample = async () => {
    const res = await fetch(SAMPLE.url).catch(() => null)
    if (!res?.ok) return useAssessmentStore.setState({ error: 'โหลดไฟล์ตัวอย่างไม่ได้' })
    addFiles([new File([await res.blob()], SAMPLE.name, { type: 'text/plain' })])
    if (!project.title) setProject({ title: SAMPLE.title })
    if (!customer) setCustomer(SAMPLE.customer)
  }
  const openRecent = async (id: string) => { if (await openHistory(id)) nav(useAssessmentStore.getState().review ? '/review' : '/summary') }

  const subs = project.industry ? subIndustries(project.industry) : []
  const leaves = project.sub ? leafIndustries(project.industry, project.sub) : []

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="ตรวจ TOR กับ product ของเรา" lead="อัปโหลด TOR ของลูกค้า ระบบจะแยกเป็นรายข้อให้ตรวจ แล้วบอกว่าเรารองรับได้กี่ข้อ ข้อไหนขาด" action={
        <button type="button" role="switch" aria-checked={hoop} disabled={running} onClick={toggleHoop} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-2 text-sm text-muted transition-colors hover:text-ink disabled:opacity-50">
          Boredom buster mode
          <span aria-hidden className={`relative h-5 w-9 rounded-full border transition-colors ${hoop ? 'border-amber bg-amber' : 'border-line-strong bg-tint'}`}>
            <span className={`absolute top-0.5 size-3.5 rounded-full bg-ink transition-all ${hoop ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
        </button>
      } />

      <section aria-label="ไฟล์ TOR" className="flex flex-col gap-4">
        {hoop ? (
          <div className="rounded-card border border-line bg-surface p-5">
            <Suspense fallback={<p className="m-0 text-sm text-muted">กำลังเตรียมสนาม…</p>}>
              <HoopDrop accept={ACCEPT} disabled={running} onScore={(f) => addFiles([f])} />
            </Suspense>
          </div>
        ) : (
        <label
          htmlFor="torFile"
          onDragOver={(e) => { e.preventDefault(); if (!running) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!running) addFiles([...e.dataTransfer.files]) }}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-3 rounded-card border-[1.5px] border-dashed px-6 pb-10 pt-12 text-center has-[:focus-visible]:outline-offset-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
            dragging ? 'border-amber bg-amber-soft' : 'border-line-strong bg-surface hover:border-ink',
            running && 'pointer-events-none opacity-60',
          )}
        >
          {/* Brand amber as a soft tile with amber-toned stroke; it turns solid amber while a file is dragged over. */}
          <span aria-hidden className={cn('mb-3 flex size-14 items-center justify-center rounded-[18px] border transition-colors', dragging ? 'border-amber bg-amber text-on-amber' : 'border-amber-line bg-amber-soft text-amber-text')}><Upload size={24} strokeWidth={1.75} /></span>
          <span className="text-[25px] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[32px]">ลาก TOR มาวางตรงนี้</span>
          <span className="text-sm text-muted">หรือ <span className="font-semibold text-ink underline underline-offset-4">เลือกไฟล์จากเครื่อง</span> ใส่ได้หลายไฟล์ เช่น TOR หลักกับภาคผนวก</span>
          <span className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted">{TYPES.map((t) => <span key={t}>{t}</span>)}</span>
          <span className="text-xs text-muted">ไฟล์ละไม่เกิน 4 MB · สูงสุด 10 ไฟล์</span>
          <input
            id="torFile"
            type="file"
            multiple
            accept={ACCEPT}
            aria-label="เลือกไฟล์ TOR"
            disabled={running}
            className="sr-only"
            onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }}
          />
        </label>
        )}

        {hasFiles ? (
          <ul aria-label="ไฟล์ที่เลือก" className="m-0 flex list-none flex-col rounded-card border border-line bg-surface p-0">
            {files.map((f, i) => (
              <li key={`${f.name}:${f.size}:${f.lastModified}`} className="flex items-center gap-3 border-t border-line pl-4 first:border-t-0">
                {f.type.startsWith('image/') ? <ImageIcon aria-hidden size={18} strokeWidth={1.5} className="flex-none text-muted" /> : <FileText aria-hidden size={18} strokeWidth={1.5} className="flex-none text-muted" />}
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
                <span className="flex-none text-xs text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                <button type="button" aria-label={`เอา ${f.name} ออก`} disabled={running} onClick={() => removeFile(i)} className="flex size-11 flex-none items-center justify-center rounded-full text-muted transition-colors hover:text-ink disabled:opacity-50">
                  <X aria-hidden size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-center text-sm text-muted">
            ยังไม่มีไฟล์ในมือ? <button type="button" onClick={loadSample} className="min-h-11 font-semibold text-ink underline underline-offset-4">ใช้ไฟล์ตัวอย่าง</button>
          </p>
        )}
      </section>

      <form aria-label="รายละเอียดโครงการ" onSubmit={(e) => e.preventDefault()} className="grid gap-x-5 gap-y-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projTitle">ชื่อโครงการ</Label>
          <input id="projTitle" type="text" autoComplete="off" placeholder="เช่น TOR ระบบสมาชิกเครือร้านอาหาร" value={project.title} onChange={(e) => setProject({ title: e.target.value })} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custName">ลูกค้า</Label>
          <input id="custName" type="text" autoComplete="off" placeholder="ชื่อบริษัทลูกค้า" value={customer} onChange={(e) => setCustomer(e.target.value)} className={field} />
        </div>

        <fieldset className="m-0 grid min-w-0 gap-x-5 gap-y-3 border-0 p-0 sm:col-span-2 sm:grid-cols-3">
          <legend className="mb-2 p-0 text-sm font-medium text-ink">ประเภทธุรกิจของลูกค้า</legend>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="indL1" className="text-xs text-muted">Industry</label>
            <select id="indL1" value={project.industry} onChange={(e) => setProject({ industry: e.target.value })} className={field}>
              <option value="">เลือก Industry</option>
              {industries().map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="indL2" className="text-xs text-muted">Sub-Industry</label>
            <select id="indL2" value={project.sub} disabled={!project.industry} onChange={(e) => setProject({ sub: e.target.value })} className={field}>
              <option value="">{project.industry ? 'เลือก Sub-Industry' : 'เลือก Industry ก่อน'}</option>
              {subs.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="indL3" className="text-xs text-muted">Sub-Sub-Industry</label>
            <select id="indL3" value={project.leaf} disabled={!project.sub} onChange={(e) => setProject({ leaf: e.target.value })} className={field}>
              <option value="">{project.sub ? 'เลือก Sub-Sub-Industry' : 'เลือก Sub-Industry ก่อน'}</option>
              {leaves.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projDue">กำหนดยื่นข้อเสนอ</Label>
          <input id="projDue" type="date" value={project.due} onChange={(e) => setProject({ due: e.target.value })} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="projValue">มูลค่าโครงการโดยประมาณ (บาท)</Label>
          <input
            id="projValue"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="เช่น 1,500,000"
            value={project.value === null ? '' : project.value.toLocaleString('en-US')}
            onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 13); setProject({ value: d ? Number(d) : null }) }}
            className={field}
          />
        </div>
      </form>

      <section aria-label="เริ่มแยก requirement" className="flex flex-col gap-4">
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <span>AI:</span>
          <span className="text-ink wrap-anywhere">{use ? `${ai?.label} · ${use.model}${use.own ? '' : ' · ค่าจากเซิร์ฟเวอร์'}` : 'ยังไม่ได้ตั้งค่า'}</span>
          <Link to="/ai-settings" className="inline-flex min-h-11 items-center font-medium text-amber-text underline underline-offset-4">{use ? 'เปลี่ยน' : 'ตั้งค่า AI'}</Link>
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button variant="primary" arrow className="min-h-12 px-6 text-base" disabled={running || !!blocker} aria-describedby={blocker ? 'run-hint' : undefined} onClick={start}>
            {running ? 'กำลังแยก Requirement…' : 'แยก Requirement'}
          </Button>
          {hint && <span id={blocker ? 'run-hint' : undefined} className="text-sm text-muted">{hint}</span>}
          {/* A TOR from the last run still waits for its review: say so, but the form stays free for the next one. */}
          {pending && !running && <Button arrow onClick={() => nav('/review')}>Review solutions</Button>}
        </div>

        {running && (
          <div className="flex flex-col gap-2 rounded-card border border-line bg-surface px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink">ขั้น {Math.min(step, STEPS.length - 1) + 1}/{STEPS.length} · {STEPS[Math.min(step, STEPS.length - 1)]?.[0]}</span>
              {startedAt && <span aria-hidden className="tabular-nums text-muted"><Elapsed since={startedAt} /></span>}
            </div>
            <div aria-hidden className="h-1 overflow-hidden rounded-full bg-tint">
              <div className="h-full bg-amber transition-[width] duration-500" style={{ width: `${(Math.max(step, 0) / STEPS.length) * 100}%` }} />
            </div>
            {/* Only this text is announced. The ticking timer stays visual so a screen reader is not interrupted every second. */}
            <p role="status" className="m-0 text-sm text-muted">{detail}</p>
          </div>
        )}
        {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
      </section>

      {!running && (recent.length > 0 || (mode !== 'account' && last)) && (
        <section aria-labelledby="recent-h" className="flex flex-col gap-2">
          <h2 id="recent-h" className={cn(metaLabel, 'm-0')}>TOR ล่าสุด</h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {recent.length > 0
              ? recent.map((r) => {
                  const waiting = (r.counts.review ?? 0) > 0
                  const { total, cov: share } = scoreCounts(r.counts)
                  const name = r.title || r.customer || 'ไม่ระบุชื่อโครงการ'
                  return (
                    <li key={r.id} className="border-t border-line first:border-t-0">
                      <button type="button" onClick={() => openRecent(r.id)} className="flex min-h-11 w-full items-center gap-4 py-3 text-left">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium text-ink">{name}</span>
                          <span className="truncate text-xs text-muted">{[r.title ? r.customer : '', r.due && `ยื่น ${fmtDate(r.due)}`].filter(Boolean).join(', ') || `${total} ข้อ`}</span>
                        </span>
                        {waiting ? <span className="flex-none text-sm text-muted">รอตรวจ requirement</span> : <span className="flex-none text-2xl font-medium tracking-[-0.03em] text-ink">{share}<small className="text-sm text-muted">%</small></span>}
                      </button>
                    </li>
                  )
                })
              : last && (
                  <li className="flex flex-wrap items-center gap-x-5 gap-y-1 py-3">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-ink">{lastTor.title || lastTor.customer || 'ผลประเมินล่าสุด'}</span>
                      <span className="text-xs text-muted">{last.total} ข้อ · ต้องตรวจสอบ {last.counts.verify} · ต้องพัฒนา/เชื่อมระบบ {last.counts.custom + last.counts.integ}</span>
                    </span>
                    <span className="text-2xl font-medium tracking-[-0.03em] text-ink">{score(last.reqs).cov}<small className="text-sm text-muted">%</small></span>
                    <span className="flex gap-x-5">
                      <Link to="/summary" className="inline-flex min-h-11 items-center font-medium text-amber-text underline underline-offset-4">สรุป</Link>
                      <Link to="/matrix" className="inline-flex min-h-11 items-center font-medium text-amber-text underline underline-offset-4">รายข้อ</Link>
                    </span>
                  </li>
                )}
          </ul>
        </section>
      )}
    </div>
  )
}
