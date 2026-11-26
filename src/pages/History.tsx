import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { SEVERITY, scoreCounts, why } from '@/lib/verdict'
import type { StatusKey } from '@/lib/types'
import { Alert, Button, PageHeader } from '@/components/ui'
import { StaticBars, Verdict } from '@/components/tor'

interface Entry { id: string; customer: string; title?: string; due?: string; files: string[]; counts: Record<string, number>; createdAt: string }

const LEAD = 'อัปโหลด TOR ของลูกค้า แล้วดูว่า product เราตอบได้กี่ข้อ ข้อไหนขาด'
const COLS = 'md:grid-cols-[minmax(0,1fr)_200px_96px_260px_44px]'
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('th-TH', { dateStyle: 'medium' })
const when = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

/** One bar per requirement from the counts: lightest status first, mandatory before optional. */
const barsOf = (c: Record<string, number>) =>
  SEVERITY.flatMap((k: StatusKey) => {
    const o = c[`o:${k}`] ?? 0
    return [...Array.from({ length: (c[k] ?? 0) - o }, () => ({ s: k, o: false })), ...Array.from({ length: o }, () => ({ s: k, o: true }))]
  })

export default function History() {
  const nav = useNavigate()
  const { mode, openHistory, historyId, expireSession } = useAssessmentStore()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'account') return
    fetch('/api/history')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (res.status === 401) expireSession()
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
        setEntries(body.entries)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'โหลดประวัติไม่สำเร็จ'))
  }, [mode, expireSession])

  async function open(id: string) {
    setError(null)
    if (await openHistory(id)) nav(useAssessmentStore.getState().review ? '/review' : '/summary')
    else setError(useAssessmentStore.getState().error ?? 'เปิดรายการนี้ไม่ได้')
  }

  async function remove(id: string) {
    const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-requested-with': 'tor-scouter' } })
    setAsking(null)
    if (!res.ok) return setError('ลบไม่สำเร็จ')
    if (id === historyId) useAssessmentStore.setState({ historyId: null })
    setEntries((es) => es?.filter((e) => e.id !== id) ?? null)
  }

  if (mode !== 'account') {
    return (
      <>
        <PageHeader title="TOR ทั้งหมด" lead={LEAD} />
        <Alert tone="info" title="ประวัติใช้ได้เมื่อเปิดระบบบัญชี">ผู้ดูแลระบบต้องตั้งค่า database ก่อน แล้วล็อกอินเพื่อให้ TOR ถูกบันทึกอัตโนมัติ</Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader title="TOR ทั้งหมด" lead={LEAD} />
      {error && <p role="alert" className="m-0 text-danger">{error}</p>}
      {entries === null && !error && <p role="status" className="m-0 text-muted">กำลังโหลด…</p>}
      {entries?.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-6 py-20 text-center">
          <p className="m-0 text-3xl tracking-[-0.03em] text-ink">ยังไม่มี TOR</p>
          <p className="m-0 max-w-sm text-muted">TOR ที่แยก requirement แล้วจะอยู่ที่นี่ ทั้งที่รอตรวจและที่เทียบกับ KB เสร็จแล้ว</p>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber px-5 text-sm font-semibold text-on-amber no-underline hover:bg-amber-hover">อัปโหลด TOR <span aria-hidden>→</span></Link>
        </div>
      )}
      {entries && entries.length > 0 && (
        <div role="table" aria-label="TOR ทั้งหมด" className="flex flex-col">
          <div role="row" className={`hidden gap-6 border-b border-line pb-3 text-[13px] text-muted md:grid ${COLS}`}>
            <span role="columnheader">โครงการ</span>
            <span role="columnheader">Requirement</span>
            <span role="columnheader">รองรับได้</span>
            <span role="columnheader">ผลและเหตุผล</span>
            <span role="columnheader"><span className="sr-only">ลบ</span></span>
          </div>
          {/* The rows, in their own group under the header line, as in the mockup: each row draws the line above it, and a
              pointed-at row turns into a rounded tinted box that hides its own line and the next row's, so nothing crosses it. */}
          <div role="rowgroup" className="flex flex-col">
          {entries.map((e) => {
            const waiting = (e.counts.review ?? 0) > 0
            const s = scoreCounts(e.counts)
            const w = why(s)
            const name = e.title || e.customer || 'ไม่ระบุชื่อโครงการ'
            const sub = [e.title ? e.customer : '', e.due ? `ยื่น ${fmtDate(e.due)}` : ''].filter(Boolean).join(', ') || when(e.createdAt)
            return (
              <div key={e.id} role="row" className="group relative -mx-3.5 rounded-2xl border-t border-line transition-colors first:border-t-0 hover:border-transparent hover:bg-tint [&:hover+[role=row]]:border-transparent">
                {asking === e.id ? (
                  <div role="alert" className="flex flex-wrap items-center gap-3 px-3.5 py-5 text-sm">
                    ลบ {name}? กู้คืนไม่ได้
                    <Button variant="danger" onClick={() => remove(e.id)}>ลบเลย</Button>
                    <Button variant="ghost" onClick={() => setAsking(null)}>ยกเลิก</Button>
                  </div>
                ) : (
                  <div className={`grid grid-cols-1 items-center gap-x-6 gap-y-3 px-3.5 py-4 ${COLS}`}>
                    <div role="cell" className="flex min-w-0 flex-col">
                      {/* The name is the link to the TOR; the whole row is its hit area. */}
                      <button type="button" onClick={() => open(e.id)} aria-label={`เปิด ${name}`} className="w-fit border-0 bg-transparent p-0 text-left text-lg font-semibold tracking-[-0.02em] text-ink wrap-anywhere after:absolute after:inset-0 after:content-['']">{name}</button>
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
                    <div role="cell" className="relative z-10 md:justify-self-end">
                      <button type="button" onClick={() => setAsking(e.id)} aria-label={`ลบ ${name}`} className="inline-flex size-11 items-center justify-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-surface hover:text-danger">
                        <Trash2 size={17} aria-hidden />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      )}
    </>
  )
}
