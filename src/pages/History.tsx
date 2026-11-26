import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { Alert, PageHeader } from '@/components/ui'
import { TorRows, type TorEntry as Entry } from '@/components/TorList'

const LEAD = 'อัปโหลด TOR ของลูกค้า แล้วดูว่า product เราตอบได้กี่ข้อ ข้อไหนขาด'
export default function History() {
  const nav = useNavigate()
  const { mode, openHistory, historyId, expireSession } = useAssessmentStore()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      {entries && entries.length > 0 && <TorRows entries={entries} label="TOR ทั้งหมด" header onOpen={open} onRemove={remove} />}
    </>
  )
}
