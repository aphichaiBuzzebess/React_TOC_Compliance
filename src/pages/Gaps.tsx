import { gapCount } from '@/lib/assessment'
import { useAssessment } from '@/lib/useAssessment'
import { Alert, PageHeader, StatusBadge } from '@/components/ui'

export default function Gaps() {
  const a = useAssessment()
  return (
    <>
      <PageHeader title="Feature gap & recommendation" />
      <Alert tone="info" title={`${gapCount(a)} requirements need work beyond configuration`}>
        Customization, integration or not supported. Effort and cost estimation are out of scope for this prototype.
      </Alert>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        {a.gaps.map((g) => (
          <article key={g.ids} className="flex flex-col gap-3 rounded-md border border-line bg-white px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[13px] text-brand-text">{g.ids}</span>
              <StatusBadge s={g.s} />
            </div>
            <h2 className="m-0 text-base font-medium text-[#262626]">{g.title}</h2>
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
