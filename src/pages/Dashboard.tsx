import { useNavigate } from 'react-router-dom'
import { MODULES, ORDER, STATUS, TOTAL, pct } from '@/data/tor'
import { Button, Card, PageHeader, StatCard } from '@/components/ui'

const KPIS = [
  { label: 'Total requirements', value: String(TOTAL), foot: 'Extracted from TOR' },
  { label: 'Fully supported', value: String(STATUS.full.count), foot: `${pct(STATUS.full.count, TOTAL)} of TOR` },
  { label: 'Supported incl. configuration', value: String(STATUS.full.count + STATUS.config.count), foot: `${pct(STATUS.full.count + STATUS.config.count, TOTAL)} product fit` },
  { label: 'Feature gaps', value: String(STATUS.custom.count + STATUS.integ.count + STATUS.none.count), foot: 'Customization, integration, not supported' },
  { label: 'Need verification', value: String(STATUS.verify.count), foot: 'Confirm with product team' },
]

export default function Dashboard() {
  const nav = useNavigate()
  return (
    <>
      <PageHeader title="Coverage dashboard" action={<Button onClick={() => nav('/matrix')}>Open compliance matrix</Button>} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {KPIS.map((k) => <StatCard key={k.label} {...k} suffix="reqs" />)}
      </div>

      <Card title="Compliance status">
        <div className="flex flex-col gap-5 p-6">
          <div role="img" aria-label={`Status distribution across ${TOTAL} requirements`} className="flex h-6 gap-0.5 overflow-hidden rounded">
            {ORDER.map((k) => <span key={k} className="h-6" style={{ width: pct(STATUS[k].count, TOTAL), background: STATUS[k].dot }} />)}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-6 gap-y-3">
            {ORDER.map((k) => (
              <div key={k} className="flex items-center gap-2.5">
                <span className="size-2.5 flex-none rounded-sm" style={{ background: STATUS[k].dot }} />
                <span className="min-w-0 flex-1">{STATUS[k].label}</span>
                <span className="font-medium">{STATUS[k].count}</span>
                <span className="w-12 text-right text-xs text-muted">{pct(STATUS[k].count, TOTAL)}</span>
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
              {MODULES.map(([name, total, full]) => (
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
