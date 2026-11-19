import { Link, useNavigate } from 'react-router-dom'
import { FileText, Image as ImageIcon, Upload, X } from 'lucide-react'
import { activeAi, hasAi, useAssessmentStore } from '@/store/useAssessmentStore'
import { STEPS } from '@/data/tor'
import { AI_PROVIDERS } from '@/data/models'
import { useAssessment } from '@/lib/useAssessment'
import { Button, Card, Elapsed, Eyebrow, Pill, highlight, metaLabel } from '@/components/ui'
import { ease } from '@/components/motion'
import { Logo } from '@/components/Logo'
import { motion } from 'motion/react'

/** Abstract product preview in a tilted window. Decorative: it shows the shape of the result, not data. */
function Preview() {
  const bars = [34, 48, 30, 56, 44, 62, 50, 70, 58, 80, 66, 92]
  const rows = ['Requirement ที่แยกได้', 'สถานะ compliance ต่อข้อ', 'คำถามที่ต้องถามลูกค้า']
  return (
    <div aria-hidden className="hidden rotate-[-2deg] overflow-hidden rounded-xl border border-line bg-surface shadow-[0_18px_40px_-24px_rgba(26,26,23,0.35)] lg:block">
      <div className="flex items-center justify-between border-b border-line bg-tint px-4 py-2.5 text-xs text-muted">
        <span className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="size-2 rounded-full bg-line-strong" />)}</span>
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
              <span className="text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line px-4 py-2.5 text-center text-xs text-muted">Interface preview · ไม่ใช่ข้อมูลจริง</div>
    </div>
  )
}

/** The numbered marker of a step: amber and ticked when done, solid ink when it is the one to do now. */
function Marker({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  return (
    <span
      className={`flex size-7 flex-none items-center justify-center rounded-full border text-xs font-semibold ${
        done ? 'border-amber bg-amber text-on-amber' : current ? 'border-ink bg-ink text-inverse' : 'border-line-strong bg-surface text-muted'
      }`}
    >
      {done ? '✓' : n}
    </span>
  )
}

export default function NewAssessment() {
  const nav = useNavigate()
  const last = useAssessment()
  const { step, running, startedAt, detail, error, files, customer, result, addFiles, removeFile, setCustomer, runReal, reset } = useAssessmentStore()
  const aiReady = useAssessmentStore(hasAi)
  const use = useAssessmentStore(activeAi)
  const done = step >= STEPS.length
  const hasFiles = files.length > 0
  const ai = AI_PROVIDERS.find((p) => p.id === use?.provider)
  const runLabel = done ? `Completed · ${result?.length ?? 0} requirements assessed` : running ? `Running step ${step + 1} of ${STEPS.length}` : 'Ready to run'

  const blocker = done || running ? null : !aiReady && !hasFiles ? 'ใส่ AI key และเลือกไฟล์ TOR ก่อน' : !aiReady ? 'ใส่ AI key ก่อน' : !hasFiles ? 'เลือกไฟล์ TOR ก่อน' : null
  const runNote = done ? `เสร็จแล้ว · ${result?.length ?? 0} ข้อ` : running ? 'กำลังทำงาน ดูความคืบหน้าด้านล่าง' : (blocker ?? 'พร้อมแล้ว')
  // Steps in order; the first one not yet done is the current one.
  const flags = [aiReady, hasFiles, done]
  const current = flags.findIndex((f) => !f)

  const start = () => {
    void runReal()
    document.getElementById('workflow')?.scrollIntoView?.({ block: 'center' }) // the progress is below: bring it into view
  }

  return (
    <>
      <section className="grid items-start gap-x-12 gap-y-6 lg:grid-cols-[1fr_minmax(0,500px)] lg:grid-rows-[auto_1fr]">
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <Eyebrow>TOR compliance × AI</Eyebrow>
          <h1 className="m-0 text-[clamp(2rem,3.7vw,3rem)] leading-[1.08] text-ink">
            {['Read the TOR.', 'Match the evidence.'].map((t, i) => (
              <motion.span key={t} className="block" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.05 + i * 0.1 }}>{t}</motion.span>
            ))}
            {/* The amber marker wipes in left to right; the negative insets keep its padding from being clipped. */}
            <motion.span className="block" initial={{ clipPath: 'inset(-12px 100% -12px 0)' }} animate={{ clipPath: 'inset(-12px 0% -12px 0)' }} transition={{ duration: 0.8, ease, delay: 0.3 }}>
              <span className={highlight}>Know what to ask.</span>
            </motion.span>
          </h1>
          <p className="m-0 hidden max-w-xl text-base leading-8 text-muted sm:block">อัปโหลด TOR แล้วดูว่าข้อไหน Product รองรับ ข้อไหนต้องพัฒนา และอะไรต้องถามลูกค้า</p>
        </div>

        {/* One surface, three numbered steps: the instructions are the form. */}
        <Card className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <ol aria-label="ขั้นตอน" className="m-0 list-none p-0">
            <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.25 }} aria-current={current === 0 ? 'step' : undefined} className="flex items-start gap-3 px-5 py-4">
              <Marker n={1} done={flags[0]} current={current === 0} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-semibold">ใส่ AI key</span>
                <span className="text-sm text-muted wrap-anywhere">{use ? `${ai?.label} · ${use.model}${use.own ? '' : ' · ค่าจากเซิร์ฟเวอร์'}` : 'Claude หรือ Gemini ของคุณเอง ไม่ถูกเก็บ'}</span>
              </div>
              <Link to="/ai-settings" className="inline-flex min-h-11 flex-none items-center text-sm font-medium text-amber-text underline underline-offset-4">{use ? 'เปลี่ยน' : 'ตั้งค่า AI'}</Link>
            </motion.li>

            <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.35 }} aria-current={current === 1 ? 'step' : undefined} className="flex items-start gap-3 border-t border-line px-5 py-4">
              <Marker n={2} done={flags[1]} current={current === 1} />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <span className="font-semibold">เลือกไฟล์ TOR</span>
                <label
                  htmlFor="torFile"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]) }}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 transition-colors hover:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink"
                >
                  <Upload aria-hidden size={20} strokeWidth={1.5} className="flex-none text-muted" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-sm ${hasFiles ? 'font-medium text-ink' : 'text-muted'}`}>{hasFiles ? `เลือกแล้ว ${files.length} ไฟล์` : 'ยังไม่ได้เลือกไฟล์'}</span>
                    <span className="text-xs text-muted">PDF, DOCX, XLSX หรือรูปภาพ · ลากมาวางได้ · ไฟล์ละไม่เกิน 4 MB</span>
                  </span>
                  <span className="flex-none text-sm font-medium text-amber-text underline underline-offset-4">{hasFiles ? 'เพิ่มไฟล์' : 'เลือกไฟล์'}</span>
                  <input
                    id="torFile"
                    type="file"
                    multiple
                    accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.gif"
                    className="sr-only"
                    onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }}
                  />
                </label>
                {hasFiles && (
                  <ul aria-label="ไฟล์ที่เลือก" className="m-0 flex list-none flex-col p-0">
                    {files.map((f, i) => (
                      <li key={`${f.name}:${f.size}:${f.lastModified}`} className="flex items-center gap-3 border-t border-line first:border-t-0">
                        {f.type.startsWith('image/') ? <ImageIcon aria-hidden size={18} strokeWidth={1.5} className="flex-none text-muted" /> : <FileText aria-hidden size={18} strokeWidth={1.5} className="flex-none text-muted" />}
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
                        <span className="flex-none text-xs text-muted">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" aria-label={`เอา ${f.name} ออก`} disabled={running} onClick={() => removeFile(i)} className="flex size-11 flex-none items-center justify-center rounded-full text-muted transition-colors hover:text-ink disabled:opacity-50">
                          <X aria-hidden size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="custName" className="text-sm text-muted">ชื่อลูกค้า (ไม่บังคับ)</label>
                  <input id="custName" type="text" placeholder="Customer name" value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm" />
                </div>
              </div>
            </motion.li>

            <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.45 }} aria-current={current === 2 ? 'step' : undefined} className="flex items-start gap-3 border-t border-line px-5 py-4">
              <Marker n={3} done={flags[2]} current={current === 2} />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">กด Run</span>
                  <span id={blocker ? 'run-hint' : undefined} className="text-sm text-muted">{runNote}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {!done && <Button variant="primary" arrow disabled={running || !hasFiles || !aiReady} aria-describedby={blocker ? 'run-hint' : undefined} onClick={start}>{running ? 'Assessing…' : 'Run assessment'}</Button>}
                  {done && (
                    <>
                      <Button variant="primary" arrow onClick={() => nav('/dashboard')}>View results</Button>
                      <Button onClick={reset}>Run again</Button>
                    </>
                  )}
                </div>
                {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
              </div>
            </motion.li>
          </ol>
        </Card>

        {/* Under the headline on wide screens, after the card on narrow ones, so the task always comes first. */}
        {last && !running && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-5 lg:col-start-1 lg:row-start-2">
            <span className={metaLabel}>ผลประเมินล่าสุด</span>
            <p className="m-0 text-sm leading-6 text-muted">{last.total} ข้อ · ต้องตรวจสอบ {last.counts.verify} · ต้องพัฒนา/เชื่อมระบบ {last.counts.custom + last.counts.integ}</p>
            <div className="flex flex-wrap gap-x-5">
              <Link to="/dashboard" className="inline-flex min-h-11 items-center font-medium text-amber-text underline underline-offset-4">Dashboard</Link>
              <Link to="/matrix" className="inline-flex min-h-11 items-center font-medium text-amber-text underline underline-offset-4">Matrix</Link>
            </div>
          </div>
        )}
      </section>

      {/* The one dark band: the run itself, five steps across. */}
      <section id="workflow" className="scroll-mt-24 rounded-[10px] border border-dark-line bg-dark text-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
          <div className="flex items-center gap-3">
            <Logo size={32} progress={done ? 1 : running ? Math.max(step, 0) / STEPS.length : 0} />
            <h2 className="m-0 text-xl font-medium text-white">Agent workflow</h2>
          </div>
          <span className="text-xs text-dark-muted">{runLabel}</span>
        </div>
        {/* A thin amber line fills as the steps finish; it is a visual echo of the step list, so it is hidden from screen readers. */}
        <div aria-hidden className="mx-6 mt-4 h-0.5 overflow-hidden rounded-full bg-dark-line">
          <motion.div className="h-full origin-left bg-amber" initial={false} animate={{ scaleX: Math.min(step, STEPS.length) / STEPS.length }} transition={{ duration: 0.8, ease }} />
        </div>
        <ol className="m-0 grid list-none gap-x-4 gap-y-1 p-6 sm:grid-cols-5">
          {STEPS.map(([name, desc], i) => {
            const isDone = step > i
            const active = step === i && running
            return (
              <li key={name} className="flex items-start gap-3 sm:flex-col sm:gap-2">
                {/* The marker pops when its state changes (key), and the running one pulses. */}
                <motion.span
                  key={isDone ? 'done' : active ? 'active' : 'idle'}
                  initial={isDone || active ? { scale: 0.6 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className={`flex size-7 flex-none items-center justify-center rounded-full border text-xs font-semibold ${
                    isDone ? 'border-amber bg-amber text-on-amber' : active ? 'animate-pulse border-white bg-white text-on-amber' : 'border-dark-edge text-dark-muted'
                  }`}
                >
                  {isDone ? '✓' : i + 1}
                </motion.span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-white">{name}</span>
                  <span className="text-xs leading-5 text-dark-muted">{desc}</span>
                  <span className={`mt-1 text-xs font-medium ${isDone ? 'text-amber' : active ? 'text-white' : 'text-dark-muted'}`}>{isDone ? 'Done' : active ? 'Running…' : 'Pending'}</span>
                </div>
              </li>
            )
          })}
        </ol>
        {running && (
          <div className="flex flex-wrap items-center gap-2 border-t border-dark-line bg-dark-raised px-6 py-3 text-sm text-amber">
            {/* Only this text is announced. The ticking timer stays visual so a screen reader is not interrupted every second. */}
            <p role="status" className="m-0">{detail}</p>
            {startedAt && <span aria-hidden className="font-medium">· <Elapsed since={startedAt} /></span>}
          </div>
        )}
      </section>

      <details className="rounded-[10px] border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-6 py-2 font-medium">ดูวิธีการทำงานและไฟล์ที่รองรับ</summary>
        <div className="grid items-center gap-8 px-6 pb-6 pt-2 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <p className="m-0 leading-7 text-muted">
              ระบบอ่าน TOR แล้วแยกเป็น requirement จัดโมดูล เทียบกับ <Link to="/knowledge-base" className="font-medium text-amber-text underline underline-offset-4">Knowledge base</Link> ของ Product (Obsidian vault <code>kb/</code>) ตัดสินสถานะพร้อมหลักฐาน และสรุปหัวข้อที่ TOR ยังไม่ตอบเทียบกับ Basic Question ของ BA
              ถ้าไม่มีหลักฐานใน KB จะตอบ Need Verification ไม่เดา แก้ note แล้ว deploy ใหม่ ผลประเมินจึงจะอิงข้อมูลล่าสุด
            </p>
            <div className="flex flex-wrap gap-2">
              {['แยก requirement', 'เทียบกับหลักฐาน', 'คำถามค้างถึงลูกค้า', 'Export Excel', 'PDF สรุป'].map((c) => <Pill key={c}>{c}</Pill>)}
            </div>
            <p className="m-0 text-sm text-muted">รองรับ PDF · DOCX · XLSX · รูปภาพ · Claude · Gemini · Obsidian KB</p>
          </div>
          <Preview />
        </div>
      </details>
    </>
  )
}
