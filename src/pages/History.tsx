import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { Alert, Button, Card, PageHeader } from '@/components/ui'

interface Entry { id: string; customer: string; files: string[]; counts: Record<string, number>; createdAt: string }

const when = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

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
    if (await openHistory(id)) nav('/matrix')
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
        <PageHeader title="Review history" lead="ประวัติการประเมินที่บันทึกไว้ เปิดดูย้อนหลังได้" />
        <Alert tone="info" title="ประวัติใช้ได้เมื่อเปิดระบบบัญชี">ผู้ดูแลระบบต้องตั้งค่า database ก่อน แล้วล็อกอินเพื่อให้ผลประเมินถูกบันทึกอัตโนมัติ</Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Review history" lead="ผลประเมินที่บันทึกอัตโนมัติ 50 รายการล่าสุด เปิดดูซ้ำหรือลบได้ เห็นได้เฉพาะคุณ" />
      {error && <p role="alert" className="m-0 text-danger">{error}</p>}
      {entries === null && !error && <p role="status" className="m-0 text-muted">กำลังโหลด…</p>}
      {entries?.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-[10px] border border-line bg-surface px-6 py-20 text-center">
          <p className="m-0 text-3xl tracking-[-0.03em] text-ink">ยังไม่มีประวัติ</p>
          <p className="m-0 max-w-sm text-muted">ผลประเมินที่เสร็จแล้วจะถูกบันทึกไว้ที่นี่โดยอัตโนมัติ</p>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber px-5 text-sm font-semibold text-on-amber no-underline hover:bg-amber-hover">New assessment <span aria-hidden>→</span></Link>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {entries?.map((e) => (
          <Card key={e.id}>
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="m-0 text-xl font-medium text-ink wrap-anywhere">{e.customer || 'ไม่ระบุลูกค้า'}</h2>
                <span className="text-xs text-muted">{when(e.createdAt)}{e.files.length > 0 ? ` · ${e.files.join(', ')}` : ''}</span>
                <span className="text-xs text-muted">{Object.values(e.counts).reduce((a, b) => a + b, 0)} ข้อ · ทำได้เลย {e.counts.full ?? 0} · ตั้งค่า {e.counts.config ?? 0} · ต้องพัฒนา/เชื่อมระบบ {(e.counts.custom ?? 0) + (e.counts.integ ?? 0)} · ต้องตรวจสอบ {e.counts.verify ?? 0}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {asking === e.id ? (
                  <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                    ลบรายการนี้? กู้คืนไม่ได้
                    <Button variant="danger" onClick={() => remove(e.id)}>ลบเลย</Button>
                    <Button variant="ghost" onClick={() => setAsking(null)}>ยกเลิก</Button>
                  </span>
                ) : (
                  <>
                    <Button variant="primary" arrow onClick={() => open(e.id)} aria-label={`เปิด ${e.customer || 'ไม่ระบุลูกค้า'} ${when(e.createdAt)}`}>เปิด</Button>
                    <Button variant="ghost" onClick={() => setAsking(e.id)} aria-label={`ลบ ${e.customer || 'ไม่ระบุลูกค้า'} ${when(e.createdAt)}`}>ลบ</Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}
