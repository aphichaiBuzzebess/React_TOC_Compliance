import { useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { Taxonomy } from '@/data/taxonomy'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { kb, INPUT, KbError } from './kbFetch'
import Versions from './Versions'

type Kind = 'zone' | 'service'
interface Row { id: string; label: string; hint: string; examples?: string[]; archived?: boolean; confirmed?: boolean }
interface Sel { kind: Kind; index: number }
const clone = (t: Taxonomy): Taxonomy => JSON.parse(JSON.stringify(t))
const blank = { label: '', hint: '', examples: [] as string[], archived: false }

/** Where a row sits in the list: zones are one group; services are split by how settled they are. */
const group = (kind: Kind, r: Row) => (r.archived ? 'เก็บแล้ว' : kind === 'zone' ? 'ใช้งาน' : r.confirmed === false ? 'ยังไม่ยืนยัน' : 'ยืนยันแล้ว')
const GROUPS: Record<Kind, string[]> = { zone: ['ใช้งาน', 'เก็บแล้ว'], service: ['ยืนยันแล้ว', 'ยังไม่ยืนยัน', 'เก็บแล้ว'] }

export default function TaxonomyTab({ taxonomy, updatedAt, admin, reload, noteCounts = {} }: { taxonomy: Taxonomy; updatedAt: string | null; admin: boolean; reload: () => void; noteCounts?: Record<string, number> }) {
  const [draft, setDraft] = useState<Taxonomy>(() => clone(taxonomy))
  const [sel, setSel] = useState<Sel | null>(taxonomy.zones[0] ? { kind: 'zone', index: 0 } : null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [versions, setVersions] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(taxonomy)
  const listOf = (k: Kind): Row[] => (k === 'zone' ? draft.zones : draft.services)
  const known = (k: Kind) => new Set((k === 'zone' ? taxonomy.zones : taxonomy.services).map((x) => x.id))
  const current = sel ? listOf(sel.kind)[sel.index] : undefined
  const isNew = !!sel && !!current && !known(sel.kind).has(current.id)

  const setList = (k: Kind, rows: Row[]) => setDraft(k === 'zone' ? { ...draft, zones: rows } : { ...draft, services: rows as Taxonomy['services'] })
  const patch = (p: Partial<Row>) => sel && setList(sel.kind, listOf(sel.kind).map((r, i) => (i === sel.index ? { ...r, ...p } : r)))
  const add = (k: Kind) => {
    const rows = [...listOf(k), k === 'service' ? { id: '', ...blank, confirmed: true } : { id: '', ...blank }]
    setList(k, rows)
    setSel({ kind: k, index: rows.length - 1 })
  }
  const dropNew = () => {
    if (!sel) return
    setList(sel.kind, listOf(sel.kind).filter((_, i) => i !== sel.index))
    setSel(null)
  }

  async function save() {
    setMsg(null)
    const tidy = (rows: Row[]) => rows.map((r) => ({ ...r, examples: (r.examples ?? []).map((e) => e.trim()).filter(Boolean) }))
    const clean = { zones: tidy(draft.zones), services: tidy(draft.services) } as Taxonomy
    try {
      await kb('taxonomy', { method: 'PUT', body: { taxonomy: clean, updatedAt } })
      useAssessmentStore.setState({ taxonomy: clean }) // the pickers on Review and Matrix use it at once
      reload()
    } catch (e) {
      setMsg({ ok: false, t: e instanceof KbError ? e.message : 'บันทึกไม่สำเร็จ' })
    }
  }

  const renderList = (k: Kind, title: string) => {
    const rows = listOf(k)
    return (
      <section aria-label={title} className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="m-0 text-sm font-semibold text-ink">{title}</h3>
          <span className="text-xs text-muted">{rows.filter((r) => !r.archived).length} ใช้งาน</span>
        </div>
        <p className="m-0 px-1 pb-1 text-xs leading-5 text-muted">{k === 'zone' ? 'ประเภทของ Product เช่น CRM+ หรือ App project' : 'บริการหรือฟีเจอร์ที่ requirement ใช้ เช่น Point หรือ User Management'}</p>
        {GROUPS[k].map((g) => {
          const items = rows.map((r, index) => ({ r, index })).filter(({ r }) => group(k, r) === g)
          if (items.length === 0) return null
          return (
            <div key={g} className="flex flex-col gap-0.5">
              {(k === 'service' || g === 'เก็บแล้ว') && <span className="px-1 pt-1 text-xs font-bold uppercase tracking-[0.08em] text-muted">{g} · {items.length}</span>}
              {items.map(({ r, index }) => {
                const on = sel?.kind === k && sel.index === index
                const used = noteCounts[r.id] ?? 0
                return (
                  <button key={index} type="button" onClick={() => setSel({ kind: k, index })} aria-current={on} className={`flex min-h-10 items-center justify-between gap-2 rounded-md border-0 px-3 text-left text-sm ${on ? 'bg-brand-soft font-medium text-brand-text' : 'bg-transparent hover:bg-tint'} ${r.archived ? 'text-muted' : ''}`}>
                    <span className="min-w-0 truncate">{r.label || r.id || 'ใหม่ (ยังไม่ตั้งชื่อ)'}</span>
                    <span className="flex-none text-xs text-muted">{!known(k).has(r.id) ? 'ใหม่' : used > 0 ? `${used} note` : ''}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
        {admin && <Button variant="ghost" className="self-start" onClick={() => add(k)}>+ เพิ่ม {k}</Button>}
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {admin && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={!dirty} onClick={save}>บันทึก taxonomy</Button>
          {dirty && <Button variant="ghost" onClick={() => { setDraft(clone(taxonomy)); setSel(null) }}>ทิ้งการแก้ไข</Button>}
          {dirty && <span className="text-xs text-muted">ยังไม่ได้บันทึก</span>}
          <Button variant="ghost" onClick={() => setVersions(!versions)}>เวอร์ชัน</Button>
          {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.t}</span>}
        </div>
      )}
      {admin && versions && <Versions kind="taxonomy" itemKey="taxonomy" token={updatedAt} onRestored={() => { setVersions(false); reload() }} onClose={() => setVersions(false)} />}
      <div className="flex flex-wrap items-start gap-6">
        <Card className="flex-[1_1_280px]">
          <div className="flex max-h-96 flex-col gap-4 overflow-y-auto p-4 lg:max-h-[70vh] [&>*]:shrink-0">
            {renderList('zone', 'Solution type')}
            {renderList('service', 'Service')}
          </div>
        </Card>

        <Card className="min-w-0 flex-[999_1_480px]">
          {!sel || !current ? (
            <div className="px-6 py-12 text-center text-muted">เลือก solution type หรือ service จากรายการ{admin ? ' หรือเพิ่มใหม่' : ''}</div>
          ) : (
            <div className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-muted">{sel.kind === 'zone' ? 'Solution type' : 'Service'}</span>
                {admin && isNew ? (
                  <>
                    <label className="sr-only" htmlFor="tx-id">id ของ {sel.kind} ใหม่</label>
                    <input id="tx-id" placeholder="id (a-z 0-9 -)" value={current.id} onChange={(e) => patch({ id: e.target.value.toLowerCase() })} className={`${INPUT} h-10 max-w-52 font-mono`} />
                  </>
                ) : (
                  <span className="font-mono text-[13px] text-brand-text">{current.id}</span>
                )}
                {current.archived && <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted">เก็บแล้ว</span>}
                {sel.kind === 'service' && current.confirmed === false && <span className="text-xs text-muted">ยังไม่ยืนยัน</span>}
                {!isNew && (noteCounts[current.id] ?? 0) > 0 && <span className="text-xs text-muted">ใช้ใน {noteCounts[current.id]} note</span>}
              </div>
              {admin ? (
                <>
                  <label className="flex flex-col gap-1 text-sm"><span className="font-medium">ชื่อ</span>
                    <input value={current.label} maxLength={80} onChange={(e) => patch({ label: e.target.value })} aria-label={`ชื่อของ ${current.id || sel.kind}`} className={`${INPUT} h-11`} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm"><span className="font-medium">คำอธิบาย <span className="font-normal text-muted">(ข้อความที่ AI อ่าน)</span></span>
                    <textarea rows={3} value={current.hint} maxLength={400} onChange={(e) => patch({ hint: e.target.value })} aria-label={`hint ของ ${current.id || sel.kind}`} className={`${INPUT} py-2 leading-6`} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm"><span className="font-medium">ตัวอย่างประโยค <span className="font-normal text-muted">(พิมพ์บรรทัดละประโยค ไม่เกิน 10 ประโยค)</span></span>
                    <textarea rows={4} value={(current.examples ?? []).join('\n')} onChange={(e) => patch({ examples: e.target.value.split('\n').slice(0, 10) })} aria-label={`ตัวอย่างของ ${current.id || sel.kind}`} className={`${INPUT} py-2 leading-6`} />
                  </label>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {sel.kind === 'service' && (
                      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={current.confirmed !== false} onChange={(e) => patch({ confirmed: e.target.checked })} className="size-5" />ยืนยันแล้ว</label>
                    )}
                    {isNew ? (
                      <Button variant="ghost" onClick={dropNew}>เอารายการใหม่นี้ออก</Button>
                    ) : (
                      <Button variant="ghost" onClick={() => patch({ archived: !current.archived })}>{current.archived ? 'เอากลับมาใช้' : 'เก็บเข้าคลัง (archive)'}</Button>
                    )}
                  </div>
                  <p className="m-0 text-xs leading-5 text-muted">บันทึกแล้วจะแก้ id ไม่ได้ และลบรายการไม่ได้ ถ้าไม่ใช้แล้วให้เก็บเข้าคลัง ผลประเมินเก่ากับ note ที่อ้างถึงรายการนี้จะได้ยังใช้ได้</p>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <h2 className="m-0 text-2xl font-medium text-ink">{current.label}</h2>
                  {current.hint && <p className="m-0 leading-7 text-muted">{current.hint}</p>}
                  {(current.examples ?? []).length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">ตัวอย่างประโยค</span>
                      <ul className="m-0 pl-5 text-sm text-muted">{current.examples!.map((e, j) => <li key={j}>{e}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
