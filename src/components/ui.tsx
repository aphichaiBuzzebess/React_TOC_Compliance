import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { STATUS, type StatusKey } from '@/data/tor'
import { NAV, navIndex } from '@/data/nav'

/** Small uppercase metadata label, the quiet way to name a field or a column. */
export const metaLabel = 'text-[11px] font-medium uppercase tracking-[0.08em] text-muted'

/** "● 03 / Results": the dot and number sequence the pages like chapters of a document. */
export function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em]', onDark ? 'text-accent-dark' : 'text-muted')}>
      <span aria-hidden className={cn('size-1.5 rounded-full', onDark ? 'bg-accent-dark' : 'bg-accent-strong')} />
      {children}
    </span>
  )
}

/** Faint sequence number in a card corner. */
export const CornerNo = ({ n, onDark = false }: { n: number; onDark?: boolean }) => (
  <span aria-hidden className={cn('absolute right-4 top-4 text-[11px] tabular-nums', onDark ? 'text-[#8d9183]' : 'text-[#8a8b81]')}>{String(n).padStart(2, '0')}</span>
)

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-[#d5dfc0] bg-leaf-tint px-3 py-1 text-xs font-medium text-leaf-ink">{children}</span>
}

/** Big tight headline; the last word takes the accent colour. */
export function Headline({ text, className }: { text: string; className?: string }) {
  const words = text.trim().split(' ')
  const last = words.pop()
  return (
    <h1 className={cn('m-0 text-[clamp(2.25rem,4.6vw,3.5rem)] text-ink', className)}>
      {words.join(' ')}{words.length ? ' ' : ''}
      <span className="text-accent">{last}</span>
    </h1>
  )
}

export function PageHeader({ title, lead, action }: { title: string; lead?: string; action?: ReactNode }) {
  const i = navIndex(useLocation().pathname)
  const section = NAV[i]?.section
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="flex min-w-0 max-w-3xl flex-col gap-4">
        {section && <Eyebrow>{String(i + 1).padStart(2, '0')} / {section}</Eyebrow>}
        <Headline text={title} />
        {lead && <p className="m-0 max-w-2xl text-base leading-8 text-muted">{lead}</p>}
      </div>
      {action}
    </header>
  )
}

export function Card({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('relative rounded-[10px] border border-line bg-white', className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="m-0 text-xl font-medium text-ink">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

type Variant = 'default' | 'primary' | 'dark' | 'ghost' | 'success' | 'danger'
const VARIANTS: Record<Variant, string> = {
  default: 'border-line-strong bg-white text-ink hover:border-ink',
  success: 'border-line-strong bg-white text-ink hover:border-ink', // same as default: orange is for the main action only
  primary: 'border-accent-strong bg-accent-strong text-white hover:border-[#a53509] hover:bg-[#a53509]',
  dark: 'border-accent-dark bg-accent-dark text-ink hover:border-[#ff8559] hover:bg-[#ff8559]', // for use on the dark band
  ghost: 'border-transparent bg-transparent text-ink underline-offset-4 hover:underline',
  danger: 'border-line-strong bg-white text-[#a23a3a] hover:border-[#a23a3a]',
}
export function Button({ variant = 'default', arrow = false, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; arrow?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], className)}
    >
      {children}
      {arrow && <span aria-hidden>→</span>}
    </button>
  )
}

export function StatusBadge({ s }: { s: StatusKey }) {
  const t = STATUS[s]
  return (
    <span className="inline-block whitespace-nowrap rounded-md border px-2 text-xs leading-5" style={{ color: t.fg, background: t.bg, borderColor: t.bd }}>
      {t.label}
    </span>
  )
}

export function Alert({ tone, title, children }: { tone: 'info' | 'warning'; title: string; children?: ReactNode }) {
  const c = tone === 'info' ? 'border-line bg-white' : 'border-[#ecd9bc] bg-[#fbf3e8]'
  return (
    <div role="status" className={cn('flex flex-col gap-1 rounded-[10px] border px-5 py-4', c)}>
      <span className="font-semibold text-ink">{title}</span>
      {children && <span className="leading-7 text-muted">{children}</span>}
    </div>
  )
}

export function StatCard({ label, value, suffix, foot, n }: { label: string; value: string; suffix: string; foot: string; n?: number }) {
  return (
    <div className="relative flex flex-col gap-2 rounded-[10px] border border-line bg-white p-6">
      {n && <CornerNo n={n} />}
      <span className={metaLabel}>{label}</span>
      <span className="text-[44px] leading-none tracking-[-0.03em] text-ink">
        {value} <span className="text-sm tracking-normal text-muted">{suffix}</span>
      </span>
      <span className="text-xs leading-5 text-muted">{foot}</span>
    </div>
  )
}

export function EmptyState({ title, lead }: { title: string; lead?: string }) {
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <div className="flex flex-col items-center gap-4 rounded-[10px] border border-line bg-white px-6 py-20 text-center">
        <p className="m-0 text-3xl tracking-[-0.03em] text-ink">ยังไม่มีผลประเมิน</p>
        <p className="m-0 max-w-sm text-muted">อัปโหลด TOR แล้วรัน assessment ก่อน ผลจะแสดงที่หน้านี้</p>
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent-strong bg-accent-strong px-5 text-sm font-semibold text-white no-underline hover:bg-[#a53509]">
          New assessment <span aria-hidden>→</span>
        </Link>
      </div>
    </>
  )
}

/** Seconds since `since`, ticking once a second. */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return <>{Math.max(0, Math.floor((now - since) / 1000))}s</>
}
