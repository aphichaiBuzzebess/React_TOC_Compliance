import { useState } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { useAssessment } from '@/lib/useAssessment'
import type { FunctionCoverage } from '@/lib/types'
import { Alert, Button, Card, EmptyState, PageHeader } from '@/components/ui'

const TONE = {
  covered: { label: 'TOR ตอบแล้ว', cls: 'border-[#B7EB8F] bg-[#F6FFED] text-[#237804]' },
  partial: { label: 'ตอบบางส่วน', cls: 'border-[#FFE58F] bg-[#FFFBE6] text-[#AD6800]' },
  missing: { label: 'TOR ไม่ได้พูดถึง', cls: 'border-[#FFCCC7] bg-[#FFF2F0] text-[#CF1322]' },
} as const

const toText = (rows: FunctionCoverage[]) =>
  rows.filter((r) => r.open.length).map((r) => `${r.function}\n${r.open.map((q) => `- ${q}`).join('\n')}`).join('\n\n')

function QuestionsContent() {
  const rows = useAssessmentStore((s) => s.coverage)
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
      <PageHeader title="Open questions for customer" action={rows && openCount > 0 ? <Button onClick={copy}>{copied ? 'Copied' : 'Copy all questions'}</Button> : undefined} />
      {!rows ? (
        <Alert tone="warning" title="ยังไม่มีผลตรวจคำถามค้าง">รัน assessment ใหม่เพื่อให้ระบบเทียบ TOR กับ Basic Question</Alert>
      ) : (
        <>
          <Alert tone="info" title={`${openCount} คำถามที่ TOR ยังไม่ตอบ`}>
            เทียบ requirement ของ TOR กับหัวข้อ Basic Question ของ BA ใช้ถามลูกค้าก่อนยืนยัน scope
          </Alert>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            {rows.map((r) => (
              <Card key={r.function}>
                <div className="flex flex-col gap-3 px-6 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="m-0 text-base font-medium text-[#262626]">{r.function}</h2>
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
  return a ? <QuestionsContent /> : <EmptyState title="Open questions for customer" />
}
