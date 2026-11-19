import { Fragment, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Elapsed, metaLabel } from '@/components/ui'
import { AI_PROVIDERS } from '@/data/models'
import { useAssessment } from '@/lib/useAssessment'
import { useAssessmentStore } from '@/store/useAssessmentStore'

const GROUPS = [
  {
    title: 'Assessment',
    items: [
      { to: '/', label: 'New assessment' },
      { to: '/dashboard', label: 'Coverage dashboard' },
      { to: '/matrix', label: 'Compliance matrix' },
      { to: '/gaps', label: 'Gap & recommendation' },
      { to: '/questions', label: 'Open questions' },
      { to: '/summary', label: 'Executive summary' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { to: '/knowledge-base', label: 'Knowledge base' },
      { to: '/ai-settings', label: 'AI settings' },
    ],
  },
]

/** A thin ring around a dot: the "scouter" lens. Drawn here so no third-party mark is used. */
function Mark() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="13" cy="13" r="11" />
      <circle cx="13" cy="13" r="3.2" fill="currentColor" stroke="none" />
      <path d="M13 2v4M13 20v4M2 13h4M20 13h4" strokeLinecap="round" />
    </svg>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const a = useAssessment()
  const { customer, running, startedAt, provider, model, apiKey } = useAssessmentStore()
  const ai = AI_PROVIDERS.find((p) => p.id === provider)

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto grid max-w-[1480px] grid-cols-[minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_210px]">
        <aside className="print:hidden flex flex-col gap-6 px-6 py-6 lg:sticky lg:top-0 lg:h-screen lg:px-7 lg:py-9">
          <Link to="/" className="flex items-center gap-2.5 text-ink no-underline">
            <Mark />
            <span className="font-serif text-[24px] leading-none">TOR Scouter</span>
          </Link>

          <nav aria-label="Main" className="flex flex-col gap-5">
            {GROUPS.map((g) => (
              <Fragment key={g.title}>
                <div className="flex flex-col gap-0.5">
                  <span className={`${metaLabel} mb-1`}>{g.title}</span>
                  <div className="flex gap-x-4 gap-y-0.5 overflow-x-auto lg:flex-col lg:overflow-visible">
                    {g.items.map((it) => (
                      <NavLink
                        key={it.to}
                        to={it.to}
                        end
                        className={({ isActive }) =>
                          `flex min-h-11 items-center whitespace-nowrap text-[15px] no-underline transition-colors duration-150 lg:min-h-9 ${isActive ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span aria-hidden className={`mr-2 size-1.5 flex-none rounded-full ${isActive ? 'bg-ink' : 'bg-transparent'}`} />
                            {it.label}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </Fragment>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4 text-xs text-muted">
            {running && startedAt && (
              <NavLink to="/" className="flex w-fit items-center gap-2 rounded-md border border-line-strong bg-white px-2.5 py-1 font-medium text-ink no-underline">
                <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-sec-teal" />
                กำลังประเมิน… <Elapsed since={startedAt} />
              </NavLink>
            )}
            <div className="flex flex-col gap-0.5">
              <span className={metaLabel}>Current TOR</span>
              <span className="text-[13px] font-medium text-ink">{customer || 'Customer TOR'}</span>
              <span>{a ? `${a.total} requirements` : 'ยังไม่มี TOR'}</span>
            </div>
            <Link to="/ai-settings" className="flex items-center gap-2 text-muted no-underline hover:text-ink">
              <span aria-hidden className={`size-1.5 rounded-full ${apiKey ? 'bg-sec-teal' : 'bg-line-strong'}`} />
              {apiKey ? `${ai?.label.split(' ')[0]} · ${model}` : 'ยังไม่ได้ใส่ AI key'}
            </Link>
            <span className="text-[11px]">Prototype</span>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-8 border-line px-5 py-8 sm:px-8 lg:border-x lg:px-10 lg:py-12">{children}</main>

        <div className="print:hidden hidden flex-col items-start gap-3 px-8 py-9 xl:flex">
          <Link to="/ai-settings" aria-label="AI settings" className="text-[15px] text-muted no-underline hover:text-ink">AI settings →</Link>
          <Link to="/knowledge-base" className="text-[15px] text-muted no-underline hover:text-ink">Knowledge base</Link>
        </div>
      </div>
    </div>
  )
}
