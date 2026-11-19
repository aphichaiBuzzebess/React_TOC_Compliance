import { Link, useNavigate } from 'react-router-dom'
import { BookMarked, CheckCircle2, FileText, Upload } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { STEPS } from '@/data/tor'
import { AI_PROVIDERS } from '@/data/models'
import { Button, Card, Elapsed, PageHeader } from '@/components/ui'

export default function NewAssessment() {
  const nav = useNavigate()
  const { step, running, startedAt, detail, error, file, customer, provider, model, apiKey, result, setFile, setCustomer, runReal, reset } = useAssessmentStore()
  const done = step >= STEPS.length
  const runLabel = done ? `Completed · ${result?.length ?? 0} requirements assessed` : running ? `Running step ${step + 1} of ${STEPS.length}` : 'Ready to run'

  return (
    <>
      <PageHeader crumb="Assessment / New" title="New TOR assessment" lead="อัปโหลด TOR ของลูกค้า เลือก AI ของคุณ แล้วให้ระบบแยก requirement และเทียบกับ Knowledge base ของ Product" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-6">
        <Card title="1. Input">
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-2">
              <span className="font-medium">Customer TOR document</span>
              <label htmlFor="torFile" className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-line-strong bg-[#FAFAFA] p-6 text-center hover:border-brand">
                <Upload aria-hidden size={32} strokeWidth={1.5} className="text-brand-text" />
                <span className="text-brand-text underline">เลือกไฟล์ TOR</span>
                <span className="text-xs text-muted">PDF, DOCX or XLSX · up to 4 MB</span>
                <input id="torFile" type="file" accept=".pdf,.docx,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {file && (
                <div className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                  <FileText aria-hidden size={18} className="text-[#595959]" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB · พร้อมประเมิน</span>
                  </div>
                  <CheckCircle2 aria-hidden size={18} className="text-[#237804]" />
                </div>
              )}
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
              <BookMarked aria-hidden size={18} className="mt-0.5 flex-none text-[#595959]" />
              <div className="flex flex-col">
                <span className="font-medium">Product knowledge base</span>
                <span className="text-xs text-muted">Obsidian vault <code>kb/</code> ใน repo แก้ note แล้ว deploy ใหม่ ผลประเมินจึงจะอิงข้อมูลล่าสุด</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="custName" className="font-medium">Customer</label>
              <input id="custName" type="text" placeholder="Customer name" value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-11 rounded-lg border border-line-strong px-[11px] text-sm" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5">
              <div className="flex flex-col">
                <span className="font-medium">{AI_PROVIDERS.find((p) => p.id === provider)?.label}</span>
                <span className="text-xs text-muted">{model} · {apiKey ? 'พร้อมใช้งาน' : 'ยังไม่ได้ใส่ API key'}</span>
              </div>
              <Link to="/ai-settings" className="text-brand-text underline">{apiKey ? 'เปลี่ยน' : 'ตั้งค่า AI'}</Link>
            </div>
          </div>
        </Card>

        <Card title="2. Agent workflow" right={<span className="text-xs text-muted">{runLabel}</span>}>
          <ol className="m-0 list-none px-6 py-2">
            {STEPS.map(([name, desc], i) => {
              const isDone = step > i
              const active = step === i && running
              return (
                <li key={name} className="flex items-start gap-4 border-b border-line py-3.5">
                  <span
                    className={`flex size-7 flex-none items-center justify-center rounded-full border text-xs font-bold ${
                      isDone ? 'border-[#B7EB8F] bg-[#F6FFED] text-[#237804]' : active ? 'border-brand bg-ink text-white' : 'border-line-strong bg-white text-muted'
                    }`}
                  >
                    {isDone ? '✓' : i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{name}</span>
                    <span className="text-xs text-muted">{desc}</span>
                  </div>
                  <span className={`whitespace-nowrap text-xs font-medium ${isDone ? 'text-[#237804]' : active ? 'text-brand-text' : 'text-muted'}`}>
                    {isDone ? 'Done' : active ? 'Running…' : 'Pending'}
                  </span>
                </li>
              )
            })}
          </ol>
          {running && (
            <p role="status" className="m-0 flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft px-6 py-3 text-brand-text">
              <span>{detail}</span>
              {startedAt && <span className="font-medium">· <Elapsed since={startedAt} /></span>}
            </p>
          )}
          {error && <p role="alert" className="m-0 px-6 text-[#CF1322]">{error}</p>}
          <div className="flex flex-wrap gap-2 px-6 pb-6 pt-4">
            {!done && (
              <>
                <Button variant="primary" className="min-h-11" disabled={running || !file || !apiKey} onClick={runReal}>{running ? 'Assessing…' : 'Run assessment'}</Button>
              </>
            )}
            {done && (
              <>
                <Button variant="primary" className="min-h-11" onClick={() => nav('/dashboard')}>View results</Button>
                <Button className="min-h-11" onClick={reset}>Run again</Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
