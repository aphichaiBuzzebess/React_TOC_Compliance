import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { hasAi, useAssessmentStore } from '@/store/useAssessmentStore'
import { MAX_TARGETS, SERVICES, UNKNOWN, ZONES, serviceLabel, zoneLabel } from '@/data/taxonomy'
import type { RawReq, Target } from '@/lib/types'
import { Alert, Button, Card, PageHeader, Pill } from '@/components/ui'

const pick = 'h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface text-sm'
const first = (r: RawReq): Target => r.targets?.[0] ?? { zone: UNKNOWN, service: UNKNOWN }

/** Requirements grouped by the zone, then the service, of their first target. Unknown groups come first. */
function group(rows: RawReq[]) {
  const zones = new Map<string, Map<string, RawReq[]>>()
  for (const r of rows) {
    const { zone, service } = first(r)
    const sv = zones.get(zone) ?? new Map<string, RawReq[]>()
    sv.set(service, [...(sv.get(service) ?? []), r])
    zones.set(zone, sv)
  }
  const unknownFirst = ([a]: [string, unknown], [b]: [string, unknown]) => Number(b === UNKNOWN) - Number(a === UNKNOWN)
  return [...zones].sort(unknownFirst).map(([zone, sv]) => [zone, [...sv].sort(unknownFirst)] as const)
}

function TargetEditor({ r }: { r: RawReq }) {
  const { setTargets } = useAssessmentStore()
  const targets = r.targets ?? [{ zone: UNKNOWN, service: UNKNOWN }]
  const set = (i: number, patch: Partial<Target>) => setTargets(r.id, targets.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  return (
    <div className="flex flex-col gap-2">
      {targets.map((t, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`${r.id}-z${i}`}>Zone ของ {r.id} ตัวที่ {i + 1}</label>
          <select id={`${r.id}-z${i}`} value={t.zone} onChange={(e) => set(i, { zone: e.target.value })} className={pick}>
            {ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            <option value={UNKNOWN}>ไม่ทราบ zone</option>
          </select>
          <label className="sr-only" htmlFor={`${r.id}-s${i}`}>Service ของ {r.id} ตัวที่ {i + 1}</label>
          <select id={`${r.id}-s${i}`} value={t.service} onChange={(e) => set(i, { service: e.target.value })} className={pick}>
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}{s.confirmed ? '' : ' (ยังไม่ยืนยัน)'}</option>)}
            <option value={UNKNOWN}>ไม่ระบุ service</option>
          </select>
          {targets.length > 1 && <Button variant="ghost" aria-label={`เอา target ที่ ${i + 1} ของ ${r.id} ออก`} onClick={() => setTargets(r.id, targets.filter((_, j) => j !== i))}>เอาออก</Button>}
        </div>
      ))}
      {targets.length < MAX_TARGETS && <div><Button variant="ghost" onClick={() => setTargets(r.id, [...targets, { zone: UNKNOWN, service: UNKNOWN }])}>+ เพิ่ม target</Button></div>}
    </div>
  )
}

function Row({ r }: { r: RawReq }) {
  const { setWantsApi } = useAssessmentStore()
  return (
    <li className="flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0">
      <p className="m-0 leading-7 text-ink wrap-anywhere"><span className="mr-2 font-mono text-[13px] text-muted">{r.id}</span>{r.text}</p>
      <TargetEditor r={r} />
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={r.wantsApi === true} onChange={(e) => setWantsApi(r.id, e.target.checked)} className="size-5" />
        <span>ขอ API · ลูกค้าสร้างระบบเองแทน tool ของเรา (ต้องถาม Tech)</span>
      </label>
    </li>
  )
}

export default function Review() {
  const nav = useNavigate()
  const { review, running, error, confirmReview, clearReview } = useAssessmentStore()
  const [asking, setAsking] = useState(false)
  const aiReady = useAssessmentStore(hasAi)

  if (!review) {
    return (
      <>
        <PageHeader title="Review zones" lead="ตรวจว่า requirement แต่ละข้อใช้ zone และ service ไหนของ Buzzebees ก่อนประเมิน" />
        <div className="flex flex-col items-center gap-4 rounded-[10px] border border-line bg-surface px-6 py-20 text-center">
          <p className="m-0 text-3xl tracking-[-0.03em] text-ink">ยังไม่มี requirement รอตรวจ</p>
          <p className="m-0 max-w-sm text-muted">อัปโหลด TOR แล้วกด Run ระบบจะจัด zone ให้ แล้วมาหยุดที่หน้านี้</p>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber bg-amber px-5 text-sm font-semibold text-on-amber no-underline hover:bg-amber-hover">New assessment <span aria-hidden>→</span></Link>
        </div>
      </>
    )
  }

  const counts = new Map<string, number>()
  for (const r of review) for (const z of new Set((r.targets ?? [first(r)]).map((t) => t.zone))) counts.set(z, (counts.get(z) ?? 0) + 1)
  const unknown = review.filter((r) => first(r).zone === UNKNOWN || first(r).service === UNKNOWN).length

  const confirm = async () => {
    await confirmReview()
    if (useAssessmentStore.getState().result) nav('/dashboard')
  }

  return (
    <>
      <PageHeader title="Review zones" lead="ตรวจว่า requirement แต่ละข้อใช้ zone และ service ไหนของ Buzzebees แก้ได้ก่อนกดยืนยัน ระบบจะหาหลักฐานเฉพาะ note ของ service นั้น" />
      <div className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-5">
        <p className="m-0 text-sm text-muted">TOR นี้ใช้ Buzzebees {counts.size} zone · {review.length} ข้อ</p>
        <ul aria-label="สรุปตาม zone" className="m-0 flex list-none flex-wrap gap-2 p-0">
          {[...counts].map(([z, n]) => <li key={z}><Pill>{zoneLabel(z)} · {n} ข้อ</Pill></li>)}
        </ul>
        {unknown > 0 && <Alert tone="warning" title={`${unknown} ข้อยังไม่ระบุ zone หรือ service`}>ข้อพวกนี้จะได้สถานะ Need Verification ถ้าไม่มี note ที่ตรง แก้ได้ในรายการด้านล่าง (อยู่บนสุด)</Alert>}
        {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" arrow disabled={running || !aiReady} onClick={confirm}>{running ? 'กำลังประเมิน…' : 'ยืนยันและประเมิน'}</Button>
          {!aiReady && <span className="text-sm text-muted">ต้องใส่ AI key ก่อนที่ <Link to="/ai-settings" className="text-brand-text underline">AI settings</Link></span>}
          {/* Clearing drops the whole pending list, so it asks once, inline. */}
          {asking ? (
            <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              ล้าง {review.length} ข้อนี้ทิ้ง? ต้องรันใหม่จากไฟล์ TOR
              <Button variant="danger" onClick={() => { clearReview(); nav('/') }}>ล้างเลย</Button>
              <Button variant="ghost" onClick={() => setAsking(false)}>ยกเลิก</Button>
            </span>
          ) : (
            <Button variant="ghost" disabled={running} onClick={() => setAsking(true)}>ล้างรายการ review</Button>
          )}
        </div>
      </div>
      {group(review).map(([zone, services]) => (
        <section key={zone} aria-label={zoneLabel(zone)} className="flex flex-col gap-3">
          <h2 className="m-0 text-xl font-medium text-ink">{zoneLabel(zone)}</h2>
          {services.map(([service, rows]) => (
            <Card key={service} title={service === UNKNOWN ? 'ไม่ระบุ service' : serviceLabel(service)} right={<span className="text-xs text-muted">{rows.length} ข้อ</span>}>
              <ul className="m-0 list-none p-0">{rows.map((r) => <Row key={r.id} r={r} />)}</ul>
            </Card>
          ))}
        </section>
      ))}
    </>
  )
}
