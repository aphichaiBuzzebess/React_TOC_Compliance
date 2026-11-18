import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { FilePlus2, LayoutDashboard, Table2, TriangleAlert, FileText, CircleHelp } from 'lucide-react'
import { useAssessment } from '@/lib/useAssessment'
import { useAssessmentStore } from '@/store/useAssessmentStore'

const NAV = [
  { to: '/', label: 'New assessment', Icon: FilePlus2 },
  { to: '/dashboard', label: 'Coverage dashboard', Icon: LayoutDashboard },
  { to: '/matrix', label: 'Compliance matrix', Icon: Table2 },
  { to: '/gaps', label: 'Gap & recommendation', Icon: TriangleAlert },
  { to: '/questions', label: 'Open questions', Icon: CircleHelp },
  { to: '/summary', label: 'Executive summary', Icon: FileText },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const a = useAssessment()
  const customer = useAssessmentStore((s) => s.customer)
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 flex-none items-center justify-between gap-4 border-b border-line bg-white px-6">
        <div className="flex min-w-0 items-center gap-3">
          <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r="13" fill="#F9A601" />
            <circle cx="14" cy="14" r="8" fill="#080909" />
            <circle cx="14" cy="14" r="3.5" fill="#F9A601" />
          </svg>
          <span className="whitespace-nowrap text-base font-bold text-[#1F1F1F]">TOR Scouter</span>
          <span className="hidden whitespace-nowrap text-xs text-muted sm:inline">Compliance &amp; Feature Gap Agent</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap rounded border border-[#FFE58F] bg-[#FFFBE6] px-2 py-0.5 text-xs font-medium text-[#AD6800]">{a.sample ? 'Prototype · sample data' : 'Live assessment'}</span>
          <span aria-label="Signed-in user" className="flex size-8 items-center justify-center rounded-full border border-brand-line bg-brand-soft text-xs font-bold text-brand-text">PM</span>
        </div>
      </header>
      <div className="flex flex-1 flex-wrap items-stretch">
        <nav aria-label="Main" className="flex flex-[1_1_232px] flex-col gap-1 bg-ink px-2 py-4 md:max-w-[232px]">
          <span className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white/65">Assessment</span>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-md px-4 text-sm ${isActive ? 'bg-brand font-medium text-ink' : 'text-white/85 hover:bg-white/10'}`
              }
            >
              <Icon aria-hidden size={18} />
              {label}
            </NavLink>
          ))}
          <div className="mt-4 flex flex-col gap-1 border-t border-white/10 px-4 py-3">
            <span className="text-[11px] text-white/65">Current TOR</span>
            <span className="text-[13px] font-medium text-white/90">{customer || 'Customer TOR'}</span>
            <span className="text-xs text-white/65">{a.total} requirements</span>
          </div>
        </nav>
        <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-6 p-6">{children}</main>
      </div>
    </div>
  )
}
