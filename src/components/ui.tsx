import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { STATUS, type StatusKey } from '@/data/tor'

export function PageHeader({ title, crumb = 'Assessment / Results', action }: { title: string; crumb?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">{crumb}</span>
        <h1 className="m-0 text-2xl font-medium text-[#262626]">{title}</h1>
      </div>
      {action}
    </div>
  )
}

export function Card({ title, right, children, className }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-md border border-line bg-white', className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="m-0 text-base font-medium text-[#262626]">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

type Variant = 'default' | 'primary' | 'success' | 'danger'
const VARIANTS: Record<Variant, string> = {
  default: 'border-[#D9D9D9] bg-white text-black/90 hover:border-brand hover:text-brand-text',
  primary: 'border-brand bg-brand text-ink hover:bg-[#E39701] hover:border-[#E39701]',
  success: 'border-[#52C41A] bg-[#52C41A] text-white hover:bg-[#389E0D]',
  danger: 'border-[#FF4D4F] bg-white text-[#CF1322] hover:bg-[#FFF2F0]',
}
export function Button({ variant = 'default', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={cn('min-h-9 rounded-md border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60', VARIANTS[variant], className)}
    />
  )
}

export function StatusBadge({ s }: { s: StatusKey }) {
  const t = STATUS[s]
  return (
    <span className="inline-block whitespace-nowrap rounded border px-2 text-xs leading-5" style={{ color: t.fg, background: t.bg, borderColor: t.bd }}>
      {t.label}
    </span>
  )
}

export function Alert({ tone, title, children }: { tone: 'info' | 'warning'; title: string; children?: ReactNode }) {
  const c = tone === 'info' ? 'border-[#91CAFF] bg-[#E6F4FF]' : 'border-[#FFE58F] bg-[#FFFBE6]'
  return (
    <div role="status" className={cn('flex flex-col gap-1 rounded-md border px-4 py-3', c)}>
      <span className="font-medium">{title}</span>
      {children && <span className="text-muted">{children}</span>}
    </div>
  )
}

export function StatCard({ label, value, suffix, foot }: { label: string; value: string; suffix: string; foot: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-white p-5">
      <span className="text-muted">{label}</span>
      <span className="text-[30px] font-medium leading-tight text-[#262626]">
        {value} <span className="text-sm font-normal text-muted">{suffix}</span>
      </span>
      <span className="text-xs text-muted">{foot}</span>
    </div>
  )
}
