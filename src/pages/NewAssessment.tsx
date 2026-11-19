import { Link, useNavigate } from 'react-router-dom'
import { BookMarked, CheckCircle2, FileText, Upload } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { STEPS } from '@/data/tor'
import { AI_PROVIDERS } from '@/data/models'
import { Button, Card, Elapsed, Eyebrow, Pill, highlight } from '@/components/ui'

/** Abstract product preview in a tilted window. Decorative: it shows the shape of the result, not data. */
function Preview() {
  const bars = [34, 48, 30, 56, 44, 62, 50, 70, 58, 80, 66, 92]
  const rows = ['Requirement ที่แยกได้', 'สถานะ compliance ต่อข้อ', 'คำถามที่ต้องถามลูกค้า']
  return (
    <div aria-hidden className="hidden rotate-[-2.5deg] overflow-hidden rounded-xl border border-line bg-white shadow-[0_18px_40px_-24px_rgba(26,26,23,0.35)] lg:block">
      <div className="flex items-center justify-between border-b border-line bg-[#f5efe0] px-4 py-2.5 text-[11px] text-muted">
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
          <span className="rounded-md bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber-text">ภาพตัวอย่าง</span>
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {bars.map((h, i) => <span key={i} style={{ height: `${h}%` }} className={`flex-1 rounded-sm ${i > 8 ? 'bg-amber' : 'bg-amber-line'}`} />)}
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r, i) => (
            <li key={r} className="flex items-center gap-3 border-t border-line py-3 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-amber-soft text-xs text-amber-text">✓</span>
              <span className="flex-1">{r}</span>
              <span className="text-[11px] text-[#8a8b81]">{String(i + 1).padStart(2, '0')}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line px-4 py-2.5 text-center text-[11px] text-muted">Interface preview · ไม่ใช่ข้อมูลจริง</div>
    </div>
  )
}

export default function NewAssessment() {
  const nav = useNavigate()
  const { step, running, startedAt, detail, error, file, customer, provider, model, apiKey, result, setFile, setCustomer, runReal, reset } = useAssessmentStore()
  const done = step >= STEPS.length
  const runLabel = done ? `Completed · ${result?.length ?? 0} requirements assessed` : running ? `Running step ${step + 1} of ${STEPS.length}` : 'Ready to run'

  return (
    <>
      <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-6">
          <Eyebrow>TOR compliance × AI</Eyebrow>
          <h1 className="m-0 text-[clamp(2.25rem,4.9vw,3.75rem)] leading-[1.05] text-ink">
            Read the TOR.<br />Match the evidence.<br />
            <span className={highlight}>Know what to ask.</span>
          </h1>
          <p className="m-0 max-w-xl text-base leading-8 text-muted">
            อัปโหลด TOR ของลูกค้า เลือก AI ของคุณ แล้วให้ระบบแยก requirement เทียบกับ Knowledge base ของ Product และสรุปว่าอะไรรองรับ อะไรต้องพัฒนา และอะไรยังต้องถามลูกค้า
          </p>
          <div className="flex flex-wrap gap-2">
            {['แยก requirement', 'เทียบกับหลักฐาน', 'คำถามค้างถึงลูกค้า', 'Export Excel', 'PDF สรุป'].map((c) => <Pill key={c}>{c}</Pill>)}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href="#assess" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber px-6 text-sm font-semibold text-ink no-underline transition-colors hover:bg-amber-hover">
              เริ่มประเมิน <span aria-hidden>↓</span>
            </a>
            <Link to="/knowledge-base" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-white px-6 text-sm font-semibold text-ink no-underline transition-colors hover:border-ink">
              ดู Knowledge base <span aria-hidden>↗</span>
            </Link>
          </div>
          <p className="m-0 text-xs text-muted">ใช้ได้ทั้ง Claude และ Gemini · API key ของคุณไม่ถูกเก็บ</p>
        </div>
        <Preview />
      </section>

      <div className="flex flex-col items-center gap-3 border-y border-line py-6 text-center">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">รองรับ</span>
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-1 text-sm font-medium text-[#5d5f4f]">
          {['PDF', 'DOCX', 'XLSX', 'Claude', 'Gemini', 'Obsidian KB'].map((t) => <span key={t}>{t}</span>)}
        </div>
      </div>

      <section id="assess" className="flex scroll-mt-24 flex-col gap-6">
        <Eyebrow>01 / เริ่มประเมิน</Eyebrow>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-6">
          <Card title="1. Input">
            <div className="flex flex-col gap-5 p-6">
              <div className="flex flex-col gap-2">
                <span className="font-medium">Customer TOR document</span>
                <label htmlFor="torFile" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-canvas p-6 text-center transition-colors hover:border-ink">
                  <Upload aria-hidden size={30} strokeWidth={1.5} className="text-amber-text" />
                  <span className="font-medium text-amber-text underline underline-offset-4">เลือกไฟล์ TOR</span>
                  <span className="text-xs text-muted">PDF, DOCX or XLSX · up to 4 MB</span>
                  <input id="torFile" type="file" accept=".pdf,.docx,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                {file && (
                  <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                    <FileText aria-hidden size={18} className="text-muted" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{file.name}</span>
                      <span className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB · พร้อมประเมิน</span>
                    </div>
                    <CheckCircle2 aria-hidden size={18} className="text-amber-text" />
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
                <BookMarked aria-hidden size={18} className="mt-0.5 flex-none text-muted" />
                <div className="flex flex-col">
                  <span className="font-medium">Product knowledge base</span>
                  <span className="text-xs leading-5 text-muted">Obsidian vault <code>kb/</code> ใน repo แก้ note แล้ว deploy ใหม่ ผลประเมินจึงจะอิงข้อมูลล่าสุด</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="custName" className="font-medium">Customer</label>
                <input id="custName" type="text" placeholder="Customer name" value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-white px-3 text-sm" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="font-medium">{AI_PROVIDERS.find((p) => p.id === provider)?.label}</span>
                  <span className="text-xs text-muted">{model} · {apiKey ? 'พร้อมใช้งาน' : 'ยังไม่ได้ใส่ API key'}</span>
                </div>
                <Link to="/ai-settings" className="font-medium text-amber-text underline underline-offset-4">{apiKey ? 'เปลี่ยน' : 'ตั้งค่า AI'}</Link>
              </div>
            </div>
          </Card>

          {/* The one dark band on the page: the run itself. */}
          <section className="relative rounded-[10px] border border-dark-line bg-dark text-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dark-line px-6 py-4">
              <h2 className="m-0 text-xl font-medium text-white">2. Agent workflow</h2>
              <span className="text-xs text-[#b8b8b0]">{runLabel}</span>
            </div>
            <ol className="m-0 list-none px-6 py-2">
              {STEPS.map(([name, desc], i) => {
                const isDone = step > i
                const active = step === i && running
                return (
                  <li key={name} className="flex items-start gap-4 border-b border-dark-line py-3.5 last:border-b-0">
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
                    </div>
                    <span className={`whitespace-nowrap text-xs font-medium ${isDone ? 'text-amber' : active ? 'text-white' : 'text-[#b8b8b0]'}`}>
                      {isDone ? 'Done' : active ? 'Running…' : 'Pending'}
                    </span>
                  </li>
                )
              })}
            </ol>
            {running && (
              <p role="status" className="m-0 flex flex-wrap items-center gap-2 border-t border-dark-line bg-[#232323] px-6 py-3 text-sm text-amber">
                <span>{detail}</span>
                {startedAt && <span className="font-medium">· <Elapsed since={startedAt} /></span>}
              </p>
            )}
            {error && <p role="alert" className="m-0 px-6 pt-4 text-[#ff9b8a]">{error}</p>}
            <div className="flex flex-wrap gap-3 px-6 pb-6 pt-5">
              {!done && (
                <Button variant="dark" arrow disabled={running || !file || !apiKey} onClick={runReal}>{running ? 'Assessing…' : 'Run assessment'}</Button>
              )}
              {done && (
                <>
                  <Button variant="dark" arrow onClick={() => nav('/dashboard')}>View results</Button>
                  <Button className="border-[#4a4a4a] bg-transparent text-white hover:border-white" onClick={reset}>Run again</Button>
                </>
              )}
            </div>
          </section>
        </div>
      </section>
    </>
  )
}
