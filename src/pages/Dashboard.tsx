import { useNavigate } from 'react-router-dom'
import { ORDER, STATUS, pct } from '@/data/tor'
import { fit, gapCount } from '@/lib/assessment'
import { useAssessment } from '@/lib/useAssessment'
import type { Assessment } from '@/lib/assessment'
import { Ring } from '@/components/motion'
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
      <PageHeader title="Coverage dashboard" lead="ภาพรวมว่าข้อไหนใน TOR ที่ Product รองรับ ต้องตั้งค่า ต้องพัฒนาเพิ่ม หรือยังตัดสินไม่ได้" action={<Button onClick={() => nav('/matrix')}>Open compliance matrix</Button>} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {kpis.map((k, i) => <StatCard key={k.label} {...k} n={i + 1} suffix="reqs" />)}
      </div>

      <Card title="Compliance status">
        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-col items-center gap-8 sm:flex-row">
            <div role="img" aria-label={`Status distribution across ${a.total} requirements: ${a.counts.full} fully supported`}>
              <Ring size={176} stroke={13} arcs={ORDER.map((k) => ({ value: a.total ? (a.counts[k] / a.total) * 100 : 0, color: STATUS[k].dot }))}>
                <span className="text-[34px] leading-none tracking-[-0.03em] text-ink">{pct(a.counts.full, a.total)}</span>
                <span className="mt-1 text-xs text-muted">Fully supported</span>
              </Ring>
            </div>
            <div className="grid w-full flex-1 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3">
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
        </div>
      </Card>

      <Card title="Coverage by module">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <caption className="sr-only">Coverage by module</caption>
            <thead>
              <tr className="bg-tint text-left">
                <th scope="col" className="border-b border-line px-6 py-3 text-xs font-medium uppercase tracking-[0.08em] text-muted">Module</th>
                <th scope="col" className="border-b border-line px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.08em] text-muted">Requirements</th>
                <th scope="col" className="border-b border-line px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.08em] text-muted">Fully supported</th>
                <th scope="col" className="w-[40%] border-b border-line py-3 pl-4 pr-6 text-xs font-medium uppercase tracking-[0.08em] text-muted">Coverage</th>
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
                      <span role="img" aria-label={`${name} coverage ${pct(full, total)}`}><Ring size={36} stroke={14} arcs={[{ value: total ? (full / total) * 100 : 0, color: 'var(--color-ink)' }]} /></span>
                      <span className="text-sm font-medium">{pct(full, total)}</span>
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
  return a ? <DashboardContent a={a} /> : <EmptyState title="Coverage dashboard" lead="ภาพรวมว่าข้อไหนใน TOR ที่ Product รองรับ ต้องตั้งค่า ต้องพัฒนาเพิ่ม หรือยังตัดสินไม่ได้" />
}
