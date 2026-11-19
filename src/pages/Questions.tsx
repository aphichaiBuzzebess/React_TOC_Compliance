import { useState } from 'react'
import { hasAi, useAssessmentStore } from '@/store/useAssessmentStore'
import { useAssessment } from '@/lib/useAssessment'
import type { FunctionCoverage } from '@/lib/types'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, CornerNo, EmptyState, PageHeader } from '@/components/ui'

const TONE = {
  covered: { label: 'TOR ตอบแล้ว', cls: 'border-[var(--st-full-bd)] bg-[var(--st-full-bg)] text-[var(--st-full-fg)]' },
  partial: { label: 'ตอบบางส่วน', cls: 'border-[var(--st-custom-bd)] bg-[var(--st-custom-bg)] text-[var(--st-custom-fg)]' },
  missing: { label: 'TOR ไม่ได้พูดถึง', cls: 'border-[var(--st-none-bd)] bg-[var(--st-none-bg)] text-[var(--st-none-fg)]' },
} as const

const toText = (rows: FunctionCoverage[]) =>
  rows.filter((r) => r.open.length).map((r) => `${r.function}\n${r.open.map((q) => `- ${q}`).join('\n')}`).join('\n\n')

function QuestionsContent() {
  const aiReady = useAssessmentStore(hasAi)
  const { coverage: rows, coverageBusy, error, runCoverage } = useAssessmentStore()
  const [copied, setCopied] = useState(false)
  const openCount = rows?.reduce((n, r) => n + r.open.length, 0) ?? 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText(rows ?? []))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the list is still on screen */
    }
  }

  return (
    <>
      <PageHeader title="Open questions for customer" lead="หัวข้อ Basic Question ที่ TOR ยังตอบไม่ครบ ใช้ถามลูกค้าก่อนยืนยัน scope" action={rows && openCount > 0 ? <Button onClick={copy}>{copied ? 'Copied' : 'Copy all questions'}</Button> : undefined} />
      {!rows ? (
        <div className="flex flex-col gap-3">
          <Alert tone="warning" title="ยังไม่มีผลตรวจคำถามค้าง">ผลประเมิน compliance ยังอยู่ครบ ตรวจเฉพาะคำถามค้างซ้ำได้โดยไม่ต้องรันประเมินใหม่ทั้งหมด</Alert>
          {error && <p role="alert" className="m-0 text-danger">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!aiReady || coverageBusy} onClick={runCoverage}>{coverageBusy ? 'กำลังตรวจ…' : 'ตรวจคำถามค้างอีกครั้ง'}</Button>
            {!aiReady && <span className="text-muted">ต้องใส่ API key ก่อนที่ <Link to="/ai-settings" className="text-brand-text underline">AI settings</Link></span>}
          </div>
        </div>
      ) : (
        <>
          <Alert tone="info" title={`${openCount} คำถามที่ TOR ยังไม่ตอบ`}>
            เทียบ requirement ของ TOR กับหัวข้อ Basic Question ของ BA ใช้ถามลูกค้าก่อนยืนยัน scope
          </Alert>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            {rows.map((r, i) => (
              <Card key={r.function}>
                <div className="flex flex-col gap-3 px-6 py-5">
                  <CornerNo n={i + 1} />
                  <div className="flex flex-wrap items-center gap-3 pr-8">
                    <h2 className="m-0 text-xl font-medium text-ink">{r.function}</h2>
                    <span className={`whitespace-nowrap rounded border px-2 text-xs leading-5 ${TONE[r.coverage].cls}`}>{TONE[r.coverage].label}</span>
                  </div>
                  {r.reqIds.length > 0 && <span className="font-mono text-[13px] text-brand-text">{r.reqIds.join(', ')}</span>}
                  {r.open.length > 0 ? (
                    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">{r.open.map((q) => <li key={q}>{q}</li>)}</ul>
                  ) : (
                    <p className="m-0 text-muted">ไม่มีคำถามค้าง</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export default function Questions() {
  const a = useAssessment()
  return a ? <QuestionsContent /> : <EmptyState title="Open questions for customer" lead="หัวข้อ Basic Question ที่ TOR ยังตอบไม่ครบ ใช้ถามลูกค้าก่อนยืนยัน scope" />
}
