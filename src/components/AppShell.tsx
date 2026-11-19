import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Elapsed } from '@/components/ui'
import { AI_PROVIDERS } from '@/data/models'
import { NAV } from '@/data/nav'
import { useAssessment } from '@/lib/useAssessment'
import { useAssessmentStore } from '@/store/useAssessmentStore'

/** Orange tile with a lens: ring, centre dot and four ticks. Drawn here, so no third-party mark is used. */
function Mark() {
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40">
      <rect width="40" height="40" rx="10" fill="#e8541f" />
      <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="20" cy="20" r="9" />
        <path d="M20 7v4M20 29v4M7 20h4M29 20h4" />
      </g>
      <circle cx="20" cy="20" r="3" fill="#fff" />
      <circle cx="31.5" cy="8.5" r="2.4" fill="#7fb63f" />
    </svg>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const a = useAssessment()
  const { pathname } = useLocation()
  const { customer, running, startedAt, provider, model, apiKey } = useAssessmentStore()
  const ai = AI_PROVIDERS.find((p) => p.id === provider)

  // A new page starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="print:hidden z-30 lg:sticky lg:top-0 border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-1 px-5 py-3 sm:px-10">
          <Link to="/" className="flex items-center gap-3 text-ink no-underline">
            <Mark />
            <span className="flex flex-col leading-none">
              <span className="text-[24px] font-semibold tracking-[-0.03em]">TOR Scouter</span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Compliance workspace</span>
            </span>
          </Link>

          {pathname !== '/' && (
            <Link to="/" className="order-2 ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-accent-strong bg-accent-strong px-5 text-sm font-semibold text-white no-underline transition-colors hover:bg-[#a53509] lg:order-3 lg:ml-0">
              New assessment <span aria-hidden>→</span>
            </Link>
          )}

          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto lg:order-2 lg:ml-auto lg:w-auto">
            {NAV.filter((n) => n.to !== '/').map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end
                className={({ isActive }) =>
                  `flex min-h-11 items-center whitespace-nowrap px-2.5 text-[14px] no-underline decoration-2 underline-offset-[10px] transition-colors duration-150 ${isActive ? 'font-semibold text-ink underline' : 'text-[#4d4e46] hover:text-ink'}`
                }
              >
                {n.short}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-10 px-5 py-10 sm:px-10 lg:py-14">
        <div className="print:hidden -mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
          {running && startedAt && (
            <Link to="/" className="flex items-center gap-2 rounded-full border border-line-strong bg-white px-3 py-1 font-medium text-ink no-underline">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent-strong" />
              กำลังประเมิน… <Elapsed since={startedAt} />
            </Link>
          )}
          <span className="flex items-center gap-1.5">
            <span className="font-medium text-ink">{customer || 'Customer TOR'}</span>
            <span aria-hidden>·</span>
            <span>{a ? `${a.total} requirements` : 'ยังไม่มี TOR'}</span>
          </span>
          <Link to="/ai-settings" className="flex items-center gap-1.5 text-muted no-underline hover:text-ink">
            <span aria-hidden className={`size-1.5 rounded-full ${apiKey ? 'bg-leaf' : 'bg-line-strong'}`} />
            {apiKey ? `${ai?.label.split(' ')[0]} · ${model}` : 'ยังไม่ได้ใส่ AI key'}
          </Link>
        </div>
        {children}
      </main>

      <footer className="print:hidden border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-8 text-xs text-muted sm:px-10">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ink">TOR Scouter</span>
            <span>ประเมิน TOR ของลูกค้ากับหลักฐานของ Product</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/knowledge-base" className="min-h-6 text-muted no-underline hover:text-ink">Knowledge base</Link>
            <Link to="/ai-settings" className="min-h-6 text-muted no-underline hover:text-ink">AI settings</Link>
            <span>Prototype · key ไม่ถูกเก็บ</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
