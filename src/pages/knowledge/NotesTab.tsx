import { Fragment, useMemo, useState } from 'react'
import { Button, Card, StatusBadge } from '@/components/ui'
import { activeServices, activeZones, serviceLabel, type Taxonomy } from '@/data/taxonomy'
import type { NoteView } from '../../../server/knowledge'
import { kb, when, INPUT, KbError } from './kbFetch'
import Versions from './Versions'

type Form = { title: string; module: string; service: string; zones: string[]; support: NoteView['support']; body: string }
const SUPPORTS: NoteView['support'][] = ['full', 'config', 'custom', 'integ', 'none']
const SUPPORT_HINT: Record<NoteView['support'], string> = { full: 'ทำได้เลย', config: 'ตั้งค่าอย่างเดียว', custom: 'ต้องพัฒนาเพิ่ม', integ: 'ต้องเชื่อมระบบลูกค้า', none: 'ไม่รองรับ' }
const blank: Form = { title: '', module: '', service: '', zones: [], support: 'full', body: '' }
const toForm = (n: NoteView): Form => ({ title: n.title, module: n.module, service: n.service ?? '', zones: n.zones, support: n.support, body: n.body })

/** Just enough markdown for the vault: **bold** and [[note links]]. */
function Body({ text, open }: { text: string; open: (path: string) => void }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/).map((p, i) =>
        p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p.startsWith('[[') ? <button key={i} type="button" onClick={() => open(`${p.slice(2, -2)}.md`)} className="border-0 bg-transparent p-0 text-brand-text underline">{p.slice(2, -2)}</button>
        : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  )
}

export default function NotesTab({ notes, taxonomy, admin, reload, initial, onSelect }: { notes: NoteView[]; taxonomy: Taxonomy; admin: boolean; reload: () => void; initial?: string; onSelect?: (path: string | undefined) => void }) {
  const start = notes.find((n) => n.path === initial) ?? notes[0]
  const [sel, setSelState] = useState<string | 'new' | null>(start?.path ?? null)
  const setSel = (p: string | 'new' | null) => { setSelState(p); onSelect?.(p && p !== 'new' ? p : undefined) }
  const [form, setForm] = useState<Form>(start ? toForm(start) : blank)
  const [pending, setPending] = useState<string | 'new' | null>(null) // wanted to switch while there were unsaved changes
  const [query, setQuery] = useState('')
  const [svc, setSvc] = useState('all')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [asking, setAsking] = useState(false)
  const [versions, setVersions] = useState(false)
  const [deleted, setDeleted] = useState<{ key: string; data: { title?: string }; at: string }[] | null>(null)

  const current = sel && sel !== 'new' ? notes.find((n) => n.path === sel) : undefined
  const base = sel === 'new' ? blank : current ? toForm(current) : blank
  const dirty = admin && sel !== null && JSON.stringify(form) !== JSON.stringify(base)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = notes.filter((n) => (!q || `${n.title} ${n.module} ${n.body}`.toLowerCase().includes(q)) && (svc === 'all' || (svc === 'none' ? !n.service : n.service === svc)))
    const by = new Map<string, NoteView[]>()
    for (const n of hits) by.set(n.module || 'อื่น ๆ', [...(by.get(n.module || 'อื่น ๆ') ?? []), n])
    return [...by]
  }, [notes, query, svc])

  function go(target: string | 'new') {
    if (dirty && target !== sel) return setPending(target)
    open(target)
  }
  function open(target: string | 'new') {
    setPending(null)
    setMsg(null)
    setAsking(false)
    setVersions(false)
    setSel(target)
    setForm(target === 'new' ? blank : toForm(notes.find((n) => n.path === target) ?? ({ ...blank } as NoteView)))
  }

  async function save() {
    setMsg(null)
    try {
      const body = { ...form, service: form.service || null }
      const r = sel === 'new'
        ? await kb<{ path: string }>('notes', { method: 'POST', body })
        : await kb<{ path: string }>('notes', { method: 'PUT', body: { ...body, path: sel, updatedAt: current?.updatedAt ?? null } })
      setMsg({ ok: true, t: 'บันทึกแล้ว' })
      setSel(r.path)
      reload()
    } catch (e) {
      setMsg({ ok: false, t: e instanceof KbError ? e.message : 'บันทึกไม่สำเร็จ' })
    }
  }
  async function remove() {
    if (!current?.updatedAt) return
    setAsking(false)
    try {
      await kb('notes', { method: 'DELETE', query: { path: current.path, updatedAt: current.updatedAt } })
      setSel(null)
      setForm(blank)
      reload()
    } catch (e) {
      setMsg({ ok: false, t: e instanceof KbError ? e.message : 'ลบไม่สำเร็จ' })
    }
  }
  async function showDeleted() {
    const r = await kb<{ deleted: { key: string; data: { title?: string }; at: string }[] }>('versions', { query: { kind: 'note', deleted: '1' } }).catch(() => null)
    setDeleted(r?.deleted ?? [])
  }
  async function bringBack(key: string) {
    try {
      const v = await kb<{ versions: { id: number }[] }>('versions', { query: { kind: 'note', key } })
      await kb('restore', { method: 'POST', body: { id: v.versions[0]?.id, updatedAt: null } })
      setDeleted(null)
      reload()
    } catch (e) {
      setMsg({ ok: false, t: e instanceof KbError ? e.message : 'กู้คืนไม่สำเร็จ' })
    }
  }

  const noService = admin && form.service === '' && sel !== null
  return (
    <div className="flex flex-wrap items-start gap-6">
      <Card className="flex-[1_1_280px]">
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto p-4 lg:max-h-[70vh] [&>*]:shrink-0">
          {admin && <Button variant="primary" onClick={() => go('new')}>+ Note ใหม่</Button>}
          <label htmlFor="kbq" className="sr-only">Search notes</label>
          <input id="kbq" type="search" placeholder={`ค้นหา ${notes.length} note`} value={query} onChange={(e) => setQuery(e.target.value)} className={`${INPUT} h-11`} />
          <label htmlFor="kbsvc" className="sr-only">กรองตาม service</label>
          <select id="kbsvc" value={svc} onChange={(e) => setSvc(e.target.value)} className={`${INPUT} h-11 bg-surface`}>
            <option value="all">ทุก service</option>
            {taxonomy.services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            <option value="none">ไม่มี service</option>
          </select>
          {groups.length === 0 && <p className="m-0 py-4 text-center text-muted">ไม่พบ note</p>}
          {groups.map(([module, items]) => (
            <div key={module} className="flex flex-col gap-1">
              <span className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-muted">{module}</span>
              {items.map((n) => (
                <button key={n.path} type="button" onClick={() => go(n.path)} aria-current={n.path === sel} className={`flex min-h-10 items-center justify-between gap-2 rounded-md border-0 px-3 text-left text-sm ${n.path === sel ? 'bg-brand-soft font-medium text-brand-text' : 'bg-transparent hover:bg-tint'}`}>
                  <span className="min-w-0 truncate">{n.title}</span>
                  <span className="size-2 flex-none rounded-full" style={{ background: `var(--st-${n.support}-dot)` }} />
                </button>
              ))}
            </div>
          ))}
          {admin && <Button variant="ghost" onClick={showDeleted}>ดู note ที่ลบแล้ว</Button>}
          {deleted && (
            <div className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm">
              <span className="font-medium">ลบแล้ว {deleted.length} รายการ</span>
              {deleted.map((d) => <div key={d.key} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{d.data.title ?? d.key}</span><Button variant="ghost" onClick={() => bringBack(d.key)} aria-label={`กู้ ${d.data.title ?? d.key} กลับมา`}>กู้คืน</Button></div>)}
              <Button variant="ghost" onClick={() => setDeleted(null)}>ปิด</Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="min-w-0 flex-[999_1_480px]">
        {pending !== null && (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line bg-amber-soft px-6 py-3 text-sm">
            ยังไม่ได้บันทึกการแก้ไข
            <Button variant="danger" onClick={() => open(pending)}>ทิ้งการแก้ไขแล้วไปต่อ</Button>
            <Button variant="ghost" onClick={() => setPending(null)}>กลับไปแก้ต่อ</Button>
          </div>
        )}
        {sel === null || (sel !== 'new' && !current) ? (
          <div className="px-6 py-12 text-center text-muted">เลือก note{admin ? ' หรือสร้างใหม่' : ''}</div>
        ) : !admin && current ? (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[13px] text-brand-text">{current.path}</span>
              <h2 className="m-0 text-2xl font-medium text-ink">{current.title}</h2>
              <div className="flex flex-wrap items-center gap-2"><StatusBadge s={current.support} /><span className="text-xs text-muted">{current.module}{current.service ? ` · ${serviceLabel(current.service, taxonomy)}` : ''}{current.zones.length ? ` · ${current.zones.join(', ')}` : ''} · อัปเดต {current.updatedAt ? when(current.updatedAt) : 'จากไฟล์'}</span></div>
            </div>
            <p className="m-0 whitespace-pre-wrap leading-[1.7]"><Body text={current.body} open={(p) => notes.some((n) => n.path === p) && setSel(p)} /></p>
          </div>
        ) : (
          <form className="flex flex-col gap-4 p-6" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <span className="font-mono text-[13px] text-brand-text">{sel === 'new' ? 'note ใหม่ ระบบจะตั้ง path ให้ตอนบันทึก และเปลี่ยนทีหลังไม่ได้' : current?.path}</span>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">ชื่อ</span>
              <input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${INPUT} h-11`} />
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm"><span className="font-medium">Service</span>
                <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} className={`${INPUT} h-11 bg-surface`}>
                  <option value="">(ไม่ระบุ)</option>
                  {[...activeServices(taxonomy), ...taxonomy.services.filter((s) => s.archived && s.id === form.service)].map((s) => <option key={s.id} value={s.id}>{s.label}{s.archived ? ' (เก็บแล้ว)' : ''}</option>)}
                </select>
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm"><span className="font-medium">Support</span>
                <select value={form.support} onChange={(e) => setForm({ ...form, support: e.target.value as Form['support'] })} className={`${INPUT} h-11 bg-surface`}>
                  {SUPPORTS.map((s) => <option key={s} value={s}>{s} · {SUPPORT_HINT[s]}</option>)}
                </select>
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm"><span className="font-medium">Module <span className="font-normal text-muted">(เว้นว่างจะใช้ชื่อ service)</span></span>
                <input value={form.module} maxLength={60} onChange={(e) => setForm({ ...form, module: e.target.value })} className={`${INPUT} h-11`} />
              </label>
            </div>
            <fieldset className="m-0 flex flex-wrap gap-x-5 border-0 p-0">
              <legend className="mb-1 p-0 text-sm font-medium">ใช้เฉพาะ zone <span className="font-normal text-muted">(ไม่เลือกเลย = ใช้ได้ทุก zone)</span></legend>
              {[...activeZones(taxonomy), ...taxonomy.zones.filter((z) => z.archived && form.zones.includes(z.id))].map((z) => (
                <label key={z.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.zones.includes(z.id)} onChange={(e) => setForm({ ...form, zones: e.target.checked ? [...form.zones, z.id] : form.zones.filter((x) => x !== z.id) })} className="size-5" />{z.label}
                </label>
              ))}
            </fieldset>
            {noService && <p className="m-0 text-xs text-muted">note ที่ไม่ระบุ service จะไม่ถูกดึงมาใช้ตอนประเมิน</p>}
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">เนื้อหา <span className="font-normal text-muted">({form.body.length.toLocaleString()} / 20,000)</span></span>
              <textarea rows={14} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={`${INPUT} py-2 leading-6`} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" type="submit" disabled={!dirty || !form.title.trim() || form.body.length > 20_000}>บันทึก</Button>
              {dirty && <span className="text-xs text-muted">ยังไม่ได้บันทึก</span>}
              {current && !asking && <Button variant="ghost" onClick={() => setAsking(true)}>ลบ note นี้</Button>}
              {asking && (
                <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">ลบ note นี้ไหม? ยังกู้เวอร์ชันเดิมได้ภายหลัง
                  <Button variant="danger" onClick={remove}>ลบเลย</Button>
                  <Button variant="ghost" onClick={() => setAsking(false)}>ยกเลิก</Button>
                </span>
              )}
              {current && <Button variant="ghost" onClick={() => setVersions(!versions)}>เวอร์ชัน</Button>}
            </div>
            {msg && <p role={msg.ok ? 'status' : 'alert'} className={`m-0 text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.t}</p>}
            {current && <p className="m-0 text-xs text-muted">แก้ล่าสุด {when(current.updatedAt)} {current.updatedBy ? `โดย ${current.updatedBy}` : ''}</p>}
            {current && versions && <Versions kind="note" itemKey={current.path} token={current.updatedAt} onRestored={() => { setVersions(false); reload() }} onClose={() => setVersions(false)} />}
          </form>
        )}
      </Card>
    </div>
  )
}
