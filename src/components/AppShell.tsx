import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { motion } from 'motion/react'
import { ease } from '@/components/motion'
import { APP_NAME, Mark } from '@/components/Brand'
import ProfileMenu from '@/components/ProfileMenu'
import { Elapsed } from '@/components/ui'
import { MENU, NAV, inTorGroup, navIndex } from '@/data/nav'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { useResolvedTheme } from '@/lib/theme'

export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { running, startedAt, mode, user, admin, signOut } = useAssessmentStore()
  const theme = useResolvedTheme()
  const setTheme = useAssessmentStore((s) => s.setTheme)
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  // Each route gets its own tab title, and a new page starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    const i = navIndex(pathname)
    document.title = i >= 0 ? `${NAV[i].label} · ${APP_NAME}` : APP_NAME
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <div className="relative flex min-h-screen flex-col bg-canvas">
      <div aria-hidden className="hive pointer-events-none absolute inset-x-0 top-0 h-[460px] print:hidden" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-inverse">ข้ามไปเนื้อหาหลัก</a>
      <header className="print:hidden relative z-30 border-b border-line bg-canvas xl:sticky xl:top-0">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 sm:px-10">
          <Link to="/" className="flex min-h-11 items-center gap-2.5 whitespace-nowrap text-base font-semibold tracking-[-0.02em] text-ink no-underline">
            <Mark size={24} />
            {APP_NAME}
          </Link>

          {/* Signed in: the avatar holds the theme switch and sign-out. Otherwise there is no profile, so the theme switch stands alone. */}
          <div className="order-2 ml-auto flex items-center gap-2 md:order-3">
            {mode === 'account' && user ? (
              <ProfileMenu user={user} admin={admin} theme={theme} onToggleTheme={toggleTheme} onSignOut={() => void signOut()} />
            ) : (
              <button
                type="button"
                aria-pressed={theme === 'dark'}
                aria-label="โหมดมืด"
                title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
                onClick={toggleTheme}
                className="flex size-11 items-center justify-center rounded-full border border-transparent bg-transparent text-muted transition-colors hover:text-ink"
              >
                {theme === 'dark' ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
              </button>
            )}
          </div>

          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-2 md:mx-0 md:w-auto md:flex-1">
            {MENU.filter((n) => !n.account || mode === 'account').map((n) => {
              // "TOR ทั้งหมด" stays lit on every page of a TOR, not only on its list.
              const lit = n.to === '/history' ? inTorGroup(pathname) : pathname === n.to
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={lit ? 'page' : undefined}
                  className={`flex min-h-11 items-center whitespace-nowrap px-2 text-[14px] no-underline decoration-2 underline-offset-[10px] transition-colors duration-150 ${lit ? 'font-semibold text-ink underline' : 'text-muted hover:text-ink'}`}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="relative mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-5 py-6 focus:outline-none sm:px-10">
        {/* Only while a run is going: a way back to its progress from any page. Nothing is shown otherwise. */}
        {running && startedAt && (
          <Link to="/" className="print:hidden -mb-4 -mt-2 flex w-fit items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-medium text-ink no-underline">
            <Mark size={16} />
            กำลังประเมิน… <Elapsed since={startedAt} />
          </Link>
        )}
        {/* Opacity only: a transform here would trap the Matrix bottom sheet (position: fixed) inside this box. */}
        <motion.div key={pathname} className="flex flex-col gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease }}>
          {children}
        </motion.div>
      </main>

      <footer className="print:hidden border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-8 text-xs text-muted sm:px-10">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ink">{APP_NAME}</span>
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
