import { Link, useNavigate } from 'react-router-dom'
import { FileText, Upload } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { STEPS } from '@/data/tor'
import { AI_PROVIDERS } from '@/data/models'
import { useAssessment } from '@/lib/useAssessment'
import { Button, Card, Elapsed, Eyebrow, Pill, highlight } from '@/components/ui'

/** Abstract product preview in a tilted window. Decorative: it shows the shape of the result, not data. */
function Preview() {
  const bars = [34, 48, 30, 56, 44, 62, 50, 70, 58, 80, 66, 92]
  const rows = ['Requirement ที่แยกได้', 'สถานะ compliance ต่อข้อ', 'คำถามที่ต้องถามลูกค้า']
  return (
    <div aria-hidden className="hidden rotate-[-2deg] overflow-hidden rounded-xl border border-line bg-white shadow-[0_18px_40px_-24px_rgba(26,26,23,0.35)] lg:block">
      <div className="flex items-center justify-between border-b border-line bg-[#f5efe0] px-4 py-2.5 text-xs text-muted">
        <span className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-[#e7dcc4]" />)}</span>
        <span>TOR Scouter · ผลประเมิน</span>
        <span className="w-10" />
      </div>
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold tracking-tight">TOR ทั้งฉบับ ในหน้าเดียว</span>
            <span className="text-xs text-muted">Coverage ของ Product</span>
          </div>
          <span className="rounded-md bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber-text">ภาพตัวอย่าง</span>
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {bars.map((h, i) => <span key={i} style={{ height: `${h}%` }} className={`flex-1 rounded-sm ${i > 8 ? 'bg-amber' : 'bg-amber-line'}`} />)}
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r, i) => (
            <li key={r} className="flex items-center gap-3 border-t border-line py-3 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-amber-soft text-xs text-amber-text">✓</span>
              <span className="flex-1">{r}</span>
              <span className="text-xs text-[#74756b]">{String(i + 1).padStart(2, '0')}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line px-4 py-2.5 text-center text-xs text-muted">Interface preview · ไม่ใช่ข้อมูลจริง</div>
    </div>
  )
}

export default function NewAssessment() {
  const nav = useNavigate()
  const last = useAssessment()
  const { step, running, startedAt, detail, error, file, customer, provider, model, apiKey, result, setFile, setCustomer, runReal, reset } = useAssessmentStore()
  const done = step >= STEPS.length
  const ai = AI_PROVIDERS.find((p) => p.id === provider)
  const runLabel = done ? `Completed · ${result?.length ?? 0} requirements assessed` : running ? `Running step ${step + 1} of ${STEPS.length}` : 'Ready to run'
  const blocker = done || running ? null : !file && !apiKey ? 'เลือกไฟล์ TOR และใส่ API key ที่ AI settings ก่อน' : !file ? 'เลือกไฟล์ TOR ก่อน' : !apiKey ? 'ใส่ API key ที่ AI settings ก่อน' : null

  // What the person still has to do, in order. The first undone item is the current one.
  const todo = [
    { done: !!apiKey, title: 'ใส่ AI key', note: apiKey ? `${ai?.label} · ${model}` : 'Claude หรือ Gemini ของคุณเอง ไม่ถูกเก็บ', link: { to: '/ai-settings', text: apiKey ? 'เปลี่ยน' : 'ตั้งค่า AI' } },
    { done: !!file, title: 'เลือกไฟล์ TOR', note: file ? file.name : 'PDF, DOCX หรือ XLSX ไม่เกิน 4 MB' },
    { done, title: 'กด Run', note: done ? `เสร็จแล้ว · ${result?.length ?? 0} ข้อ` : running ? 'กำลังทำงาน ดูความคืบหน้าด้านล่าง' : apiKey && file ? 'พร้อมแล้ว' : 'ทำข้อ 1 และ 2 ก่อน' },
  ]
  const current = todo.findIndex((t) => !t.done)

  const start = () => {
    void runReal()
    document.getElementById('workflow')?.scrollIntoView?.({ block: 'center' }) // the progress is below the hero: bring it into view
  }

  return (
    <>
      {last && !running && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-5 py-3">
          <p className="m-0 text-sm">
            <span className="font-semibold">ผลประเมินล่าสุด</span>
            <span className="text-muted"> · {last.total} ข้อ · ต้องตรวจสอบ {last.counts.verify} · ต้องพัฒนา/เชื่อมระบบ {last.counts.custom + last.counts.integ}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="default" className="min-h-11" onClick={() => nav('/dashboard')}>Dashboard</Button>
            <Button variant="default" className="min-h-11" onClick={() => nav('/matrix')}>Matrix</Button>
          </div>
        </div>
      )}

      <section className="grid items-start gap-x-12 gap-y-6 lg:grid-cols-[1fr_minmax(0,460px)]">
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <Eyebrow>TOR compliance × AI</Eyebrow>
          <h1 className="m-0 text-[clamp(2rem,3.7vw,3rem)] leading-[1.08] text-ink">
            Read the TOR.<br />Match the evidence.<br />
            <span className={highlight}>Know what to ask.</span>
          </h1>
          <p className="m-0 hidden max-w-xl text-base leading-8 text-muted sm:block">อัปโหลด TOR แล้วดูว่าข้อไหน Product รองรับ ข้อไหนต้องพัฒนา และอะไรต้องถามลูกค้า</p>
        </div>

        <ol aria-label="ขั้นตอน" className="order-3 m-0 flex max-w-xl list-none flex-col gap-3 p-0 lg:order-none lg:col-start-1 lg:row-start-2">
            {todo.map((t, i) => (
              <li key={t.title} className="flex items-start gap-3" aria-current={i === current ? 'step' : undefined}>
                <span
                  className={`mt-0.5 flex size-7 flex-none items-center justify-center rounded-full border text-xs font-semibold ${
                    t.done ? 'border-amber bg-amber text-ink' : i === current ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-muted'
                  }`}
                >
                  {t.done ? '✓' : i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={`text-[15px] ${i === current ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{t.title}</span>
                  <span className="break-words text-sm text-muted wrap-anywhere">{t.note}</span>
                </div>
                {t.link && (
                  <Link to={t.link.to} className="inline-flex min-h-11 flex-none items-center text-sm font-medium text-amber-text underline underline-offset-4">{t.link.text}</Link>
                )}
              </li>
            ))}
        </ol>

        <Card title="Input" className="order-2 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-col gap-2">
              <span className="font-medium">Customer TOR document</span>
              <label htmlFor="torFile" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-canvas p-5 text-center transition-colors hover:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink">
                {file ? <FileText aria-hidden size={28} strokeWidth={1.5} className="text-amber-text" /> : <Upload aria-hidden size={28} strokeWidth={1.5} className="text-amber-text" />}
                <span className="break-words font-medium text-amber-text underline underline-offset-4 wrap-anywhere">{file ? file.name : 'เลือกไฟล์ TOR'}</span>
                <span className="text-xs text-muted">{file ? `${(file.size / 1024).toFixed(0)} KB · กดเพื่อเปลี่ยนไฟล์` : 'PDF, DOCX or XLSX · up to 4 MB'}</span>
                <input id="torFile" type="file" accept=".pdf,.docx,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="custName" className="font-medium">Customer <span className="font-normal text-muted">(ไม่บังคับ)</span></label>
              <input id="custName" type="text" placeholder="Customer name" value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-white px-3 text-sm" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!done && <Button variant="primary" arrow disabled={running || !file || !apiKey} aria-describedby={blocker ? 'run-hint' : undefined} onClick={start}>{running ? 'Assessing…' : 'Run assessment'}</Button>}
              {done && (
                <>
                  <Button variant="primary" arrow onClick={() => nav('/dashboard')}>View results</Button>
                  <Button onClick={reset}>Run again</Button>
                </>
              )}
              {blocker && <p id="run-hint" className="m-0 w-full text-sm text-muted">{blocker}</p>}
            </div>
            {error && <p role="alert" className="m-0 text-[#a23a3a]">{error}</p>}
            <p className="m-0 text-xs leading-5 text-muted">เทียบกับ <Link to="/knowledge-base" className="font-medium text-amber-text underline underline-offset-4">Knowledge base</Link> ของ Product (Obsidian vault <code>kb/</code>) แก้ note แล้ว deploy ใหม่ ผลประเมินจึงจะอิงข้อมูลล่าสุด</p>
          </div>
        </Card>
      </section>

      {/* The one dark band: the run itself, five steps across. */}
      <section id="workflow" className="scroll-mt-24 rounded-[10px] border border-dark-line bg-dark text-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
          <h2 className="m-0 text-xl font-medium text-white">Agent workflow</h2>
          <span className="text-xs text-[#b8b8b0]">{runLabel}</span>
        </div>
        <ol className="m-0 grid list-none gap-x-4 gap-y-1 p-6 sm:grid-cols-5">
          {STEPS.map(([name, desc], i) => {
            const isDone = step > i
            const active = step === i && running
            return (
              <li key={name} className="flex items-start gap-3 sm:flex-col sm:gap-2">
                <span
                  className={`flex size-7 flex-none items-center justify-center rounded-full border text-xs font-semibold ${
                    isDone ? 'border-amber bg-amber text-ink' : active ? 'border-white bg-white text-ink' : 'border-[#4a4a4a] text-[#b8b8b0]'
                  }`}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-white">{name}</span>
                  <span className="text-xs leading-5 text-[#b8b8b0]">{desc}</span>
                  <span className={`mt-1 text-xs font-medium ${isDone ? 'text-amber' : active ? 'text-white' : 'text-[#b8b8b0]'}`}>{isDone ? 'Done' : active ? 'Running…' : 'Pending'}</span>
                </div>
              </li>
            )
          })}
        </ol>
        {running && (
          <div className="flex flex-wrap items-center gap-2 border-t border-dark-line bg-[#232323] px-6 py-3 text-sm text-amber">
            {/* Only this text is announced. The ticking timer stays visual so a screen reader is not interrupted every second. */}
            <p role="status" className="m-0">{detail}</p>
            {startedAt && <span aria-hidden className="font-medium">· <Elapsed since={startedAt} /></span>}
          </div>
        )}
      </section>

      <details className="rounded-[10px] border border-line bg-white">
        <summary className="flex min-h-11 cursor-pointer items-center px-6 py-2 font-medium">ดูวิธีการทำงานและไฟล์ที่รองรับ</summary>
        <div className="grid items-center gap-8 px-6 pb-6 pt-2 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="m-0 leading-7 text-muted">
              ระบบอ่าน TOR แล้วแยกเป็น requirement จัดโมดูล เทียบกับ Knowledge base ของ Product ตัดสินสถานะพร้อมหลักฐาน และสรุปหัวข้อที่ TOR ยังไม่ตอบเทียบกับ Basic Question ของ BA
              ถ้าไม่มีหลักฐานใน KB จะตอบ Need Verification ไม่เดา
            </p>
            <div className="flex flex-wrap gap-2">
              {['แยก requirement', 'เทียบกับหลักฐาน', 'คำถามค้างถึงลูกค้า', 'Export Excel', 'PDF สรุป'].map((c) => <Pill key={c}>{c}</Pill>)}
            </div>
            <p className="m-0 text-sm text-muted">รองรับ PDF · DOCX · XLSX · Claude · Gemini · Obsidian KB</p>
          </div>
          <Preview />
        </div>
      </details>
    </>
  )
}
