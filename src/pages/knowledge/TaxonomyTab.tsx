import { useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { Taxonomy } from '@/data/taxonomy'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { kb, INPUT, KbError } from './kbFetch'
import Versions from './Versions'

interface Row { id: string; label: string; hint: string; examples?: string[]; archived?: boolean; confirmed?: boolean }
const clone = (t: Taxonomy): Taxonomy => JSON.parse(JSON.stringify(t))

function Rows({ title, kind, rows, known, admin, onChange }: { title: string; kind: 'zone' | 'service'; rows: Row[]; known: Set<string>; admin: boolean; onChange: (rows: Row[]) => void }) {
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <Card title={title} right={<span className="text-xs text-muted">{rows.filter((r) => !r.archived).length} ใช้งาน · {rows.filter((r) => r.archived).length} เก็บแล้ว</span>}>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((r, i) => {
          const isNew = !known.has(r.id)
          return (
            <li key={i} className={`flex flex-col gap-3 border-t border-line px-6 py-4 first:border-t-0 ${r.archived ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-center gap-3">
                {admin && isNew ? (
                  <>
                    <label className="sr-only" htmlFor={`${kind}-id-${i}`}>id ของ {kind} ใหม่</label>
                    <input id={`${kind}-id-${i}`} placeholder="id (a-z 0-9 -)" value={r.id} onChange={(e) => set(i, { id: e.target.value.toLowerCase() })} className={`${INPUT} h-10 max-w-48 font-mono`} />
                  </>
                ) : (
                  <span className="font-mono text-[13px] text-brand-text">{r.id}</span>
                )}
                {r.archived && <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted">เก็บแล้ว</span>}
                {kind === 'service' && !r.confirmed && <span className="text-xs text-muted">ยังไม่ยืนยัน</span>}
              </div>
              {admin ? (
                <>
                  <label className="flex flex-col gap-1 text-sm"><span className="text-muted">ชื่อ</span>
                    <input value={r.label} maxLength={80} onChange={(e) => set(i, { label: e.target.value })} aria-label={`ชื่อของ ${r.id || kind}`} className={`${INPUT} h-10`} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm"><span className="text-muted">คำอธิบาย (hint ที่ AI เห็น)</span>
                    <textarea rows={2} value={r.hint} maxLength={400} onChange={(e) => set(i, { hint: e.target.value })} aria-label={`hint ของ ${r.id || kind}`} className={`${INPUT} py-2`} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm"><span className="text-muted">ตัวอย่างประโยค (บรรทัดละหนึ่ง ได้ไม่เกิน 10)</span>
                    <textarea rows={2} value={(r.examples ?? []).join('\n')} onChange={(e) => set(i, { examples: e.target.value.split('\n').slice(0, 10) })} aria-label={`ตัวอย่างของ ${r.id || kind}`} className={`${INPUT} py-2`} />
                  </label>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {kind === 'service' && (
                      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={r.confirmed !== false} onChange={(e) => set(i, { confirmed: e.target.checked })} className="size-5" />ยืนยันแล้ว</label>
                    )}
                    {isNew ? (
                      <Button variant="ghost" onClick={() => onChange(rows.filter((_, j) => j !== i))}>เอารายการใหม่นี้ออก</Button>
                    ) : (
                      <Button variant="ghost" onClick={() => set(i, { archived: !r.archived })}>{r.archived ? 'เอากลับมาใช้' : 'เก็บเข้าคลัง (archive)'}</Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{r.label}</span>
                  {r.hint && <span className="text-sm leading-6 text-muted">{r.hint}</span>}
                  {(r.examples ?? []).length > 0 && <ul className="m-0 pl-5 text-sm text-muted">{r.examples!.map((e, j) => <li key={j}>{e}</li>)}</ul>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default function TaxonomyTab({ taxonomy, updatedAt, admin, reload }: { taxonomy: Taxonomy; updatedAt: string | null; admin: boolean; reload: () => void }) {
  const [draft, setDraft] = useState<Taxonomy>(() => clone(taxonomy))
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [versions, setVersions] = useState(false)
  const knownZones = new Set(taxonomy.zones.map((z) => z.id))
  const knownServices = new Set(taxonomy.services.map((s) => s.id))
  const dirty = JSON.stringify(draft) !== JSON.stringify(taxonomy)

  async function save() {
    setMsg(null)
    const clean: Taxonomy = {
      zones: draft.zones.map((z) => ({ ...z, examples: (z.examples ?? []).map((e) => e.trim()).filter(Boolean) })),
      services: draft.services.map((s) => ({ ...s, examples: (s.examples ?? []).map((e) => e.trim()).filter(Boolean) })),
    }
    try {
      await kb('taxonomy', { method: 'PUT', body: { taxonomy: clean, updatedAt } })
      setMsg({ ok: true, t: 'บันทึกแล้ว' })
      useAssessmentStore.setState({ taxonomy: clean }) // the pickers on Review and Matrix use it at once
      reload()
    } catch (e) {
      setMsg({ ok: false, t: e instanceof KbError ? e.message : 'บันทึกไม่สำเร็จ' })
    }
  }

  const blank = { label: '', hint: '', examples: [] as string[], archived: false }
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-3xl text-sm leading-6 text-muted">zone และ service ที่ AI ใช้จัดหมวด requirement id เปลี่ยนไม่ได้หลังบันทึก และลบไม่ได้ (ให้เก็บเข้าคลังแทน) เพื่อให้ผลเก่ากับ note ที่อ้างถึงยังใช้ได้</p>
      <Rows title="Zone" kind="zone" rows={draft.zones} known={knownZones} admin={admin} onChange={(zones) => setDraft({ ...draft, zones })} />
      {admin && <div><Button onClick={() => setDraft({ ...draft, zones: [...draft.zones, { id: '', ...blank }] })}>+ เพิ่ม zone</Button></div>}
      <Rows title="Service" kind="service" rows={draft.services} known={knownServices} admin={admin} onChange={(services) => setDraft({ ...draft, services: services as Taxonomy['services'] })} />
      {admin && <div><Button onClick={() => setDraft({ ...draft, services: [...draft.services, { id: '', ...blank, confirmed: true }] })}>+ เพิ่ม service</Button></div>}
      {admin && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={!dirty} onClick={save}>บันทึก taxonomy</Button>
          {dirty && <span className="text-xs text-muted">ยังไม่ได้บันทึก</span>}
          {dirty && <Button variant="ghost" onClick={() => setDraft(clone(taxonomy))}>ทิ้งการแก้ไข</Button>}
          <Button variant="ghost" onClick={() => setVersions(!versions)}>เวอร์ชัน</Button>
        </div>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`m-0 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.t}</p>}
      {admin && versions && <Versions kind="taxonomy" itemKey="taxonomy" token={updatedAt} onRestored={() => { setVersions(false); reload() }} onClose={() => setVersions(false)} />}
    </div>
  )
}
