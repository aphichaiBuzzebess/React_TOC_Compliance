import { useNavigate } from 'react-router-dom'
import { ORDER, STATUS, pct } from '@/data/tor'
import { fit, gapCount } from '@/lib/assessment'
import { useAssessment } from '@/lib/useAssessment'
import type { Assessment } from '@/lib/assessment'
import { Button, Card, PageHeader, StatCard, EmptyState } from '@/components/ui'

function DashboardContent({ a }: { a: Assessment }) {
  const nav = useNavigate()
  const kpis = [
    { label: 'Total requirements', value: String(a.total), foot: 'Extracted from TOR' },
    { label: 'Fully supported', value: String(a.counts.full), foot: `${pct(a.counts.full, a.total)} of TOR` },
    { label: 'Supported incl. configuration', value: String(fit(a)), foot: `${pct(fit(a), a.total)} product fit` },
    { label: 'Feature gaps', value: String(gapCount(a)), foot: 'Customization, integration, not supported' },
    { label: 'Need verification', value: String(a.counts.verify), foot: 'Confirm with product team' },
  ]
  return (
    <>
      <PageHeader title="Coverage dashboard" action={<Button onClick={() => nav('/matrix')}>Open compliance matrix</Button>} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {kpis.map((k) => <StatCard key={k.label} {...k} suffix="reqs" />)}
      </div>

      <Card title="Compliance status">
        <div className="flex flex-col gap-5 p-6">
          <div role="img" aria-label={`Status distribution across ${a.total} requirements`} className="flex h-6 gap-0.5 overflow-hidden rounded">
            {ORDER.map((k) => <span key={k} className="h-6" style={{ width: pct(a.counts[k], a.total), background: STATUS[k].dot }} />)}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3">
            {ORDER.map((k) => (
              <div key={k} className="flex items-center gap-2.5">
                <span className="size-2.5 flex-none rounded-sm" style={{ background: STATUS[k].dot }} />
                <span className="min-w-0 flex-1">{STATUS[k].label}</span>
                <span className="font-medium">{a.counts[k]}</span>
                <span className="w-12 text-right text-xs text-muted">{pct(a.counts[k], a.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Coverage by module">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="bg-[#FAFAFA] text-left font-medium">
                <th className="border-b border-line px-6 py-3 font-medium">Module</th>
                <th className="border-b border-line px-4 py-3 text-right font-medium">Requirements</th>
                <th className="border-b border-line px-4 py-3 text-right font-medium">Fully supported</th>
                <th className="w-[40%] border-b border-line py-3 pl-4 pr-6 font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {a.modules.map(([name, total, full]) => (
                <tr key={name}>
                  <td className="border-b border-line px-6 py-3 font-medium">{name}</td>
                  <td className="border-b border-line px-4 py-3 text-right">{total}</td>
                  <td className="border-b border-line px-4 py-3 text-right">{full}</td>
                  <td className="border-b border-line py-3 pl-4 pr-6">
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className="h-2 bg-brand" style={{ width: pct(full, total) }} /></div>
                      <span className="w-11 text-right text-xs text-muted">{pct(full, total)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

export default function Dashboard() {
  const a = useAssessment()
  return a ? <DashboardContent a={a} /> : <EmptyState title="Coverage dashboard" />
}
