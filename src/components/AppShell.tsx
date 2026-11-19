import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import { ease } from '@/components/motion'
import { Elapsed } from '@/components/ui'
import { AI_PROVIDERS } from '@/data/models'
import { NAV, navIndex } from '@/data/nav'
import { useAssessment } from '@/lib/useAssessment'
import { activeAi, useAssessmentStore } from '@/store/useAssessmentStore'
import { useResolvedTheme } from '@/lib/theme'

/** Two honeycomb cells (a nod to Buzzebees) overlapping on a rising diagonal: the see-through overlap is where the requirement meets the evidence. */
const MARK_PATH =
  'M86.46 93.13 Q91.66 90.13 96.86 93.13 L149.60 123.58 Q154.79 126.58 154.79 132.58 L154.79 193.48 Q154.79 199.48 149.60 202.48 L96.86 232.93 Q91.66 235.93 86.46 232.93 L33.72 202.48 Q28.53 199.48 28.53 193.48 L28.53 132.58 Q28.53 126.58 33.72 123.58 Z M159.14 23.07 Q164.34 20.07 169.54 23.07 L222.28 53.52 Q227.47 56.52 227.47 62.52 L227.47 123.42 Q227.47 129.42 222.28 132.42 L169.54 162.87 Q164.34 165.87 159.14 162.87 L106.40 132.42 Q101.21 129.42 101.21 123.42 L101.21 62.52 Q101.21 56.52 106.40 53.52 Z'

function Mark() {
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 256 256">
      <path d={MARK_PATH} fill="#f9a601" fillRule="evenodd" />
    </svg>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const a = useAssessment()
  const { pathname } = useLocation()
  const { customer, running, startedAt } = useAssessmentStore()
  const use = useAssessmentStore(activeAi)
  const theme = useResolvedTheme()
  const setTheme = useAssessmentStore((s) => s.setTheme)
  const ai = AI_PROVIDERS.find((p) => p.id === use?.provider)

  // Each route gets its own tab title, and a new page starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    const i = navIndex(pathname)
    document.title = i >= 0 ? `${NAV[i].label} · TOR Scouter` : 'TOR Scouter'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-inverse">ข้ามไปเนื้อหาหลัก</a>
      <header className="print:hidden z-30 border-b border-line bg-canvas xl:sticky xl:top-0">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 sm:px-10">
          <Link to="/" className="flex min-h-11 items-center gap-3 text-ink no-underline">
            <Mark />
            <span className="flex flex-col leading-none">
              <span className="text-[24px] font-semibold tracking-[-0.03em]">TOR Scouter</span>
              <span className="mt-1 text-xs font-medium uppercase tracking-[0.1em] text-muted">Compliance workspace</span>
            </span>
          </Link>

          <div className="order-2 ml-auto flex items-center gap-2 xl:order-3 xl:ml-0">
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              aria-label="โหมดมืด"
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex size-11 items-center justify-center rounded-full border border-transparent bg-transparent text-muted transition-colors hover:text-ink"
            >
              {theme === 'dark' ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
            </button>
            {pathname !== '/' && (
              <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber px-5 text-sm font-semibold text-on-amber no-underline transition-colors hover:bg-amber-hover ">
                New assessment <span aria-hidden>→</span>
              </Link>
            )}
          </div>

          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto xl:order-2 xl:ml-auto xl:w-auto">
            {NAV.filter((n) => n.to !== '/').map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end
                className={({ isActive }) =>
                  `flex min-h-11 items-center whitespace-nowrap px-2 text-[14px] no-underline decoration-2 underline-offset-[10px] transition-colors duration-150 ${isActive ? 'font-semibold text-ink underline' : 'text-muted hover:text-ink'}`
                }
              >
                {n.short}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-10 px-5 py-8 focus:outline-none sm:px-10 lg:py-10">
        <div className={`print:hidden flex flex-wrap items-center gap-x-5 gap-y-0 text-xs text-muted ${pathname === '/' && !running ? 'hidden' : '-mb-6 -mt-3'}`}>
          {running && startedAt && (
            <Link to="/" className="flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 font-medium text-ink no-underline">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-amber" />
              กำลังประเมิน… <Elapsed since={startedAt} />
            </Link>
          )}
          {/* The home page shows this itself (last result, key step), so the strip would only repeat it there. */}
          {pathname !== '/' && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-ink">{customer || 'Customer TOR'}</span>
                <span aria-hidden>·</span>
                <span>{a ? `${a.total} requirements` : 'ยังไม่มี TOR'}</span>
              </span>
              <Link to="/ai-settings" className="flex min-h-11 items-center gap-1.5 text-muted no-underline hover:text-ink">
                <span aria-hidden className={`size-1.5 rounded-full ${use ? 'bg-amber' : 'bg-line-strong'}`} />
                {use ? `${ai?.label.split(' ')[0]} · ${use.model}` : 'ยังไม่ได้ใส่ AI key'}
              </Link>
            </>
          )}
        </div>
        {/* Opacity only: a transform here would trap the Matrix bottom sheet (position: fixed) inside this box. */}
        <motion.div key={pathname} className="flex flex-col gap-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease }}>
          {children}
        </motion.div>
      </main>

      <footer className="print:hidden border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-8 text-xs text-muted sm:px-10">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ink">TOR Scouter</span>
            <span>ประเมิน TOR ของลูกค้ากับหลักฐานของ Product</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/knowledge-base" className="inline-flex min-h-11 items-center text-muted no-underline hover:text-ink">Knowledge base</Link>
            <Link to="/ai-settings" className="inline-flex min-h-11 items-center text-muted no-underline hover:text-ink">AI settings</Link>
            <span>Prototype · key ไม่ถูกเก็บ</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
