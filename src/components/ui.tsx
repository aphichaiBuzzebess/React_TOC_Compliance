import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { STATUS, type StatusKey } from '@/data/tor'
import { NAV, navIndex } from '@/data/nav'
import { CountUp, Reveal, ease } from '@/components/motion'
import { motion } from 'motion/react'

/** Small uppercase metadata label, the quiet way to name a field or a column. */
export const metaLabel = 'text-xs font-medium uppercase tracking-[0.08em] text-muted'

/** "● 03 / Results": the dot and number sequence the pages like chapters of a document. */
export function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em]', onDark ? 'text-amber' : 'text-muted')}>
      <span aria-hidden className={cn('size-1.5 rounded-full', 'bg-amber')} />
      {children}
    </span>
  )
}

/** Faint sequence number in a card corner. */
export const CornerNo = ({ n, onDark = false }: { n: number; onDark?: boolean }) => (
  <span aria-hidden className={cn('absolute right-6 top-6 text-xs leading-4 tabular-nums', onDark ? 'text-dark-muted' : 'text-muted')}>{String(n).padStart(2, '0')}</span>
)

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-amber-line bg-amber-soft px-3 py-1 text-xs font-medium text-amber-text">{children}</span>
}

/** Amber marker behind the last words: the brand colour as a fill, since amber text on paper is unreadable. */
export const highlight = 'rounded-lg bg-amber px-2.5 text-on-amber box-decoration-clone'

/** Big tight headline; the last word is highlighted. */
export function Headline({ text, className }: { text: string; className?: string }) {
  const words = text.trim().split(' ')
  const last = words.pop()
  return (
    <h1 className={cn('m-0 text-[clamp(2.25rem,4.6vw,3.5rem)] text-ink', className)}>
      {words.join(' ')}{words.length ? ' ' : ''}
      <span className={highlight}>{last}</span>
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
        <Reveal y={20}><Headline text={title} /></Reveal>
        {lead && <Reveal delay={0.1}><p className="m-0 max-w-2xl text-base leading-8 text-muted">{lead}</p></Reveal>}
      </div>
      {action}
    </header>
  )
}

export function Card({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <motion.section
      className={cn('relative rounded-[10px] border border-line bg-surface', className)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.6, ease }}
    >
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="m-0 text-xl font-medium text-ink">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </motion.section>
  )
}

type Variant = 'default' | 'primary' | 'dark' | 'ghost' | 'success' | 'danger'
const VARIANTS: Record<Variant, string> = {
  default: 'border-line-strong bg-surface text-ink hover:border-ink',
  success: 'border-line-strong bg-surface text-ink hover:border-ink', // same as default: orange is for the main action only
  primary: 'border-amber bg-amber text-on-amber hover:border-amber-hover hover:bg-amber-hover disabled:border-line-strong disabled:bg-tint disabled:text-muted disabled:opacity-100 disabled:hover:bg-tint', // disabled reads as gray, not as a washed-out amber
  dark: 'border-amber bg-amber text-on-amber hover:border-amber-hover hover:bg-amber-hover', // same fill; kept as a name for use on the dark band
  ghost: 'border-transparent bg-transparent text-ink underline-offset-4 hover:underline',
  danger: 'border-line-strong bg-surface text-danger hover:border-danger',
}
export function Button({ variant = 'default', arrow = false, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; arrow?: boolean }) {
  return (
    <button
      type="button"
      {...p}
      className={cn('group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], className)}
    >
      {children}
      {arrow && <span aria-hidden className="transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-enabled:group-hover:translate-x-1">→</span>}
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
  const c = tone === 'info' ? 'border-line bg-surface' : 'border-amber-line bg-amber-soft'
  return (
    <div role="status" className={cn('flex flex-col gap-1 rounded-[10px] border px-5 py-4', c)}>
      <span className="font-semibold text-ink">{title}</span>
      {children && <span className="leading-7 text-muted">{children}</span>}
    </div>
  )
}

export function StatCard({ label, value, suffix, foot, n }: { label: string; value: string; suffix: string; foot: string; n?: number }) {
  return (
    <Reveal delay={((n ?? 1) - 1) * 0.07} className="relative flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-6 transition-[border-color,translate] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-line-strong">
      {n && <CornerNo n={n} />}
      {/* Two lines tall and clear of the corner number, so the figures line up across cards whether the label wraps or not. */}
      <span className={cn(metaLabel, 'min-h-8 pr-8 leading-4')}>{label}</span>
      <span className="text-[44px] leading-none tracking-[-0.03em] text-ink">
        {/^\d+$/.test(value) ? <CountUp value={Number(value)} /> : value} <span className="text-sm tracking-normal text-muted">{suffix}</span>
      </span>
      <span className="mt-auto pt-1 text-xs leading-5 text-muted">{foot}</span>
    </Reveal>
  )
}

export function EmptyState({ title, lead }: { title: string; lead?: string }) {
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <div className="flex flex-col items-center gap-4 rounded-[10px] border border-line bg-surface px-6 py-20 text-center">
        <p className="m-0 text-3xl tracking-[-0.03em] text-ink">ยังไม่มีผลประเมิน</p>
        <p className="m-0 max-w-sm text-muted">อัปโหลด TOR แล้วรัน assessment ก่อน ผลจะแสดงที่หน้านี้</p>
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber px-5 text-sm font-semibold text-on-amber no-underline hover:bg-amber-hover">
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
