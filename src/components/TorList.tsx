import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { SEVERITY, scoreCounts, why } from '@/lib/verdict'
import type { StatusKey } from '@/lib/types'
import { Button } from '@/components/ui'
import { StaticBars, Verdict } from '@/components/tor'
import { cn } from '@/lib/utils'

/** A saved TOR as the history list returns it: no requirements, only the counts. */
export interface TorEntry { id: string; customer: string; title?: string; due?: string; files: string[]; counts: Record<string, number>; createdAt: string }

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' })
const when = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
export const torName = (e: TorEntry) => e.title || e.customer || 'ไม่ระบุชื่อโครงการ'

/** One bar per requirement from the counts: lightest status first, mandatory before optional. */
const barsOf = (c: Record<string, number>) =>
  SEVERITY.flatMap((k: StatusKey) => {
    const o = c[`o:${k}`] ?? 0
    return [...Array.from({ length: (c[k] ?? 0) - o }, () => ({ s: k, o: false })), ...Array.from({ length: o }, () => ({ s: k, o: true }))]
  })

/**
 * TORs as rows, as in the mockup (the TOR list and "TOR ล่าสุด" on the upload page): name, one bar per requirement, the
 * share supported, and the verdict with its reason and next step; a TOR still waiting for its review says so.
 * Each row draws the line above it; a pointed-at row becomes a rounded tinted box that hides its own line and the next one.
 * `onRemove` adds a delete button that asks once in the row.
 */
export function TorRows({ entries, label, header = false, onOpen, onRemove }: { entries: TorEntry[]; label: string; header?: boolean; onOpen: (id: string) => void; onRemove?: (id: string) => void }) {
  const [asking, setAsking] = useState<string | null>(null)
  const cols = onRemove ? 'md:grid-cols-[minmax(0,1fr)_200px_96px_260px_44px]' : 'md:grid-cols-[minmax(0,1fr)_200px_96px_260px]'
  return (
    <div role="table" aria-label={label} className="flex flex-col">
      {header && (
        <div role="row" className={`hidden gap-6 border-b border-line pb-3 text-[13px] text-muted md:grid ${cols}`}>
          <span role="columnheader">โครงการ</span>
          <span role="columnheader">Requirement</span>
          <span role="columnheader">รองรับได้</span>
          <span role="columnheader">ผลและเหตุผล</span>
          {onRemove && <span role="columnheader"><span className="sr-only">ลบ</span></span>}
        </div>
      )}
      <div role="rowgroup" className="flex flex-col">
        {entries.map((e) => {
          const waiting = (e.counts.review ?? 0) > 0
          const s = scoreCounts(e.counts)
          const w = why(s)
          const name = torName(e)
          const sub = [e.title ? e.customer : '', e.due ? `ยื่น ${fmtDate(e.due)}` : ''].filter(Boolean).join(', ') || when(e.createdAt)
          return (
            <div key={e.id} role="row" className="group relative -mx-3.5 rounded-2xl border-t border-line transition-colors first:border-t-0 hover:border-transparent hover:bg-tint [&:hover+[role=row]]:border-transparent">
              {asking === e.id && onRemove ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 px-3.5 py-5 text-sm">
                  ลบ {name}? กู้คืนไม่ได้
                  <Button variant="danger" onClick={() => { setAsking(null); onRemove(e.id) }}>ลบเลย</Button>
                  <Button variant="ghost" onClick={() => setAsking(null)}>ยกเลิก</Button>
                </div>
              ) : (
                <div className={cn('grid grid-cols-1 items-center gap-x-6 gap-y-3 px-3.5 py-4', cols)}>
                  <div role="cell" className="flex min-w-0 flex-col">
                    {/* The name is the link to the TOR; the whole row is its hit area. */}
                    <button type="button" onClick={() => onOpen(e.id)} aria-label={`เปิด ${name}`} className="w-fit border-0 bg-transparent p-0 text-left text-lg font-semibold tracking-[-0.02em] text-ink wrap-anywhere after:absolute after:inset-0 after:content-['']">{name}</button>
                    <span className="text-sm text-muted wrap-anywhere">{sub}</span>
                  </div>
                  <div role="cell" className="min-w-0">
                    {waiting ? <span className="text-sm text-muted">ยังไม่ได้เทียบกับ KB</span> : <StaticBars bars={barsOf(e.counts)} className="h-[34px]" />}
                  </div>
                  <div role="cell" className={waiting ? 'text-4xl font-semibold leading-none text-muted' : 'text-4xl font-semibold leading-none tracking-[-0.05em] text-ink tabular-nums'}>
                    {waiting ? '–' : <>{s.cov}<small className="ml-0.5 text-lg text-muted">%</small></>}
                  </div>
                  <div role="cell" className="flex flex-col gap-1 text-sm">
                    {waiting ? (
                      <>
                        <span className="inline-flex items-center gap-2.5 font-semibold text-ink"><i aria-hidden className="inline-block size-2 rounded-full bg-line-strong" />รอตรวจ requirement</span>
                        <span className="text-[13.5px] text-ink">{e.counts.review} ข้อ กดเพื่อตรวจแล้วเริ่มเทียบ</span>
                      </>
                    ) : (
                      <>
                        <Verdict v={s.verdict} className="text-sm" />
                        <span className="text-[13.5px] text-ink">{w.why}</span>
                        <span className="text-[13px] text-muted">{w.act}</span>
                      </>
                    )}
                  </div>
                  {onRemove && (
                    <div role="cell" className="relative z-10 md:justify-self-end">
                      <button type="button" onClick={() => setAsking(e.id)} aria-label={`ลบ ${name}`} className="inline-flex size-11 items-center justify-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-surface hover:text-danger">
                        <Trash2 size={17} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
