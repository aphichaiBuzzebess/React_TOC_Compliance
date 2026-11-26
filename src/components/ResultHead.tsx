import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { TOR_TABS } from '@/data/nav'
import { useAssessmentStore } from '@/store/useAssessmentStore'

const fmtDate = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('th-TH', { dateStyle: 'medium' })
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

/** The top of one TOR's pages: a way back to the list, which TOR this is and what it asks for, its actions, and the two tabs. */
export default function ResultHead({ action }: { action?: ReactNode }) {
  const customer = useAssessmentStore((s) => s.customer)
  const project = useAssessmentStore((s) => s.project)
  const scope = useAssessmentStore((s) => s.scope)
  const confirmed = useAssessmentStore((s) => s.confirmed)
  const total = useAssessmentStore((s) => s.result?.length ?? 0)
  const industry = [project.industry, project.sub, project.leaf].filter((x, i, xs) => x && x !== xs[i - 1]).join(' › ')
  const facts = [
    project.title ? customer : '',
    industry,
    project.due && `ยื่น ${fmtDate(project.due)}`,
    project.value !== null && `มูลค่า ${project.value.toLocaleString('th-TH')} บาท`,
    `${total} ข้อ`,
    confirmed && `ยืนยัน requirement${confirmed.by ? ` โดย ${confirmed.by}` : ''} ${fmtDate(confirmed.at)} ${fmtTime(confirmed.at)} น.`,
  ].filter(Boolean) as string[]
  return (
    <div className="flex flex-col gap-3">
      <Link to="/history" className="print:hidden inline-flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted no-underline hover:text-ink">
        <ChevronLeft size={16} aria-hidden /> TOR ทั้งหมด
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="flex min-w-0 max-w-3xl flex-col gap-2">
          <div className="flex flex-wrap gap-x-[18px] gap-y-0.5 text-sm text-muted">{facts.map((f) => <span key={f}>{f}</span>)}</div>
          <h1 className="m-0 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink wrap-anywhere sm:text-[34px]">{project.title || customer || 'TOR'}</h1>
          {scope && <p className="m-0 mt-1 max-w-[70ch] text-[15px] leading-7 text-muted">{scope}</p>}
        </div>
        {action && <div className="print:hidden flex flex-wrap gap-2.5">{action}</div>}
      </header>
      <nav aria-label="TOR" className="print:hidden flex gap-6 overflow-x-auto border-b border-line">
        {TOR_TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            className={({ isActive }) =>
              `-mb-px flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 text-[15px] font-medium no-underline transition-colors duration-150 ${isActive ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`
            }
          >
            {t.label}
            {t.count && <span className="tabular-nums text-muted">{total}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
