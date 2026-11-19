import { gapCount } from '@/lib/assessment'
import { useAssessment } from '@/lib/useAssessment'
import type { Assessment } from '@/lib/assessment'
import { Alert, CornerNo, PageHeader, StatusBadge, EmptyState } from '@/components/ui'

function GapsContent({ a }: { a: Assessment }) {
  return (
    <>
      <PageHeader title="Feature gap & recommendation" lead="รายการที่ต้องพัฒนาเพิ่ม เชื่อมระบบ หรือ Product ยังไม่รองรับ พร้อมคำแนะนำ" />
      <Alert tone="info" title={`${gapCount(a)} requirements need work beyond configuration`}>
        These need customization or integration, or the product does not support them. Effort and cost estimates are not part of this prototype.
      </Alert>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        {a.gaps.map((g, i) => (
          <article key={g.ids} className="relative flex flex-col gap-3 rounded-[10px] border border-line bg-white px-6 py-5">
            <CornerNo n={i + 1} />
            <div className="flex flex-wrap items-center gap-3 pr-8">
              <span className="font-mono text-[13px] text-brand-text">{g.ids}</span>
              <StatusBadge s={g.s} />
            </div>
            <h2 className="m-0 text-xl font-medium text-ink">{g.title}</h2>
            <p className="m-0 text-muted">{g.gap}</p>
            <div className="flex flex-col gap-0.5 rounded-md border border-brand-line bg-brand-soft p-3">
              <span className="text-xs font-bold text-brand-text">Recommended</span>
              <span>{g.rec}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

export default function Gaps() {
  const a = useAssessment()
  return a ? <GapsContent a={a} /> : <EmptyState title="Feature gap & recommendation" lead="รายการที่ต้องพัฒนาเพิ่ม เชื่อมระบบ หรือ Product ยังไม่รองรับ พร้อมคำแนะนำ" />
}
