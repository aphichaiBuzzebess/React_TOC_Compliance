import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { STATUS, type StatusKey } from '@/data/tor'

/** Section coding: a small filled pill per part of the app. Colour carries meaning, not decoration. */
const SECTIONS: Record<string, { label: string; cls: string }> = {
  'Assessment / New': { label: 'เริ่มประเมิน', cls: 'bg-sec-blue' },
  'Assessment / Results': { label: 'ผลประเมิน', cls: 'bg-sec-teal' },
  Questions: { label: 'คำถามถึงลูกค้า', cls: 'bg-sec-plum' },
  Reference: { label: 'อ้างอิง', cls: 'bg-sec-ochre' },
}

export function PageHeader({ title, crumb = 'Assessment / Results', lead, action }: { title: string; crumb?: string; lead?: string; action?: ReactNode }) {
  const sec = SECTIONS[crumb] ?? SECTIONS['Assessment / Results']
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 max-w-2xl flex-col gap-3">
        <span className={cn('w-fit rounded-md px-2.5 py-0.5 text-xs font-medium text-white', sec.cls)}>{sec.label}</span>
        <h1 className="m-0 text-[34px] text-ink">{title}</h1>
        {lead && <p className="m-0 text-[15px] leading-7 text-muted">{lead}</p>}
      </div>
      {action}
    </header>
  )
}

export function Card({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[10px] border border-line bg-white', className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="m-0 text-xl text-ink">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

type Variant = 'default' | 'primary' | 'success' | 'danger'
const VARIANTS: Record<Variant, string> = {
  default: 'border-line-strong bg-white text-ink hover:border-ink',
  primary: 'border-ink bg-ink text-white hover:bg-[#33332f] hover:border-[#33332f]',
  success: 'border-line-strong bg-white text-sec-teal hover:border-sec-teal', // outlined: the page keeps one filled action
  danger: 'border-line-strong bg-white text-[#a23a3a] hover:border-[#a23a3a]',
}
export function Button({ variant = 'default', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={cn('min-h-11 rounded-lg border px-4 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], className)}
    />
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
  const c = tone === 'info' ? 'border-[#d9e1e9] bg-[#f5f8fa]' : 'border-[#e8dcc0] bg-[#faf6ec]'
  return (
    <div role="status" className={cn('flex flex-col gap-1 rounded-[10px] border px-5 py-4', c)}>
      <span className="font-medium text-ink">{title}</span>
      {children && <span className="leading-7 text-muted">{children}</span>}
    </div>
  )
}

/** Small uppercase metadata label, the quiet way to name a field or a column. */
export const metaLabel = 'text-[11px] font-medium uppercase tracking-[0.08em] text-muted'

export function StatCard({ label, value, suffix, foot }: { label: string; value: string; suffix: string; foot: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-white p-5">
      <span className={metaLabel}>{label}</span>
      <span className="font-serif text-[40px] leading-tight text-ink">
        {value} <span className="font-sans text-sm text-muted">{suffix}</span>
      </span>
      <span className="text-xs leading-5 text-muted">{foot}</span>
    </div>
  )
}

export function EmptyState({ title, crumb, lead }: { title: string; crumb?: string; lead?: string }) {
  return (
    <>
      <PageHeader title={title} crumb={crumb} lead={lead} />
      <div className="flex flex-col items-center gap-4 rounded-[10px] border border-line bg-white px-6 py-20 text-center">
        <p className="m-0 font-serif text-2xl text-ink">ยังไม่มีผลประเมิน</p>
        <p className="m-0 max-w-sm text-muted">อัปโหลด TOR แล้วรัน assessment ก่อน ผลจะแสดงที่หน้านี้</p>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-lg border border-ink bg-ink px-4 font-medium text-white no-underline hover:bg-[#33332f]">New assessment</Link>
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
