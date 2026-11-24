import { useCallback, useEffect, useState } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { Alert, Button, PageHeader } from '@/components/ui'
import type { Taxonomy } from '@/data/taxonomy'
import type { NoteView } from '../../server/knowledge'
import type { PromptKey } from '../../server/prompts'
import { kb, KbError } from './knowledge/kbFetch'
import NotesTab from './knowledge/NotesTab'
import PromptsTab, { type PromptView } from './knowledge/PromptsTab'
import TaxonomyTab from './knowledge/TaxonomyTab'

interface Loaded { status: 'database' | 'defaults'; notes: NoteView[]; taxonomy: Taxonomy; taxonomyUpdatedAt: string | null; prompts: Record<PromptKey, PromptView> }
type TabId = 'taxonomy' | 'notes' | 'prompts'
// The order follows the run: first requirements are sorted with the taxonomy, then judged with the notes. Prompts steer the AI in each step.
const TABS: { id: TabId; label: string; about: string }[] = [
  { id: 'taxonomy', label: 'Solution & Service · ใช้จัดหมวด', about: 'ใช้ตอนจัดหมวด: AI อ่าน requirement แต่ละข้อแล้วตัดสินว่าอยู่ solution ไหนของ Buzzebees (เช่น CRM+ หรือ App project) และใช้ service อะไร ถ้ายังไม่มี solution หรือ service ที่ต้องการ ให้เพิ่มที่นี่' },
  { id: 'notes', label: 'Capabilities · สิ่งที่ Product ทำได้', about: 'ใช้ตอนประเมิน: ระบบหา note ของ service นั้น แล้วดูว่า Product ทำข้อนั้นได้ไหม ผลที่ได้คือ ทำได้เลย, ตั้งค่า, ต้องพัฒนาเพิ่ม, ต้องเชื่อมระบบ หรือไม่รองรับ ถ้า service ไหนไม่มี note ข้อที่ตกที่ service นั้นจะขึ้นว่า Need Verification' },
  { id: 'prompts', label: 'Prompts · คำสั่งถึง AI', about: 'คำสั่งที่ส่งให้ AI ในแต่ละขั้น: แยก requirement ออกจาก TOR, จัดหมวด, ประเมิน และตรวจว่า TOR ตอบคำถามของ BA ครบหรือยัง' },
]

export default function KnowledgeBase() {
  const { mode, admin } = useAssessmentStore()
  const [tab, setTab] = useState<TabId>('taxonomy')
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0) // bumped on every reload: the editors start again from what the server has
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [selNote, setSelNote] = useState<string | undefined>() // survives a reload of the data
  const canEdit = mode === 'account' && admin
  // How many notes use each service (and zone): shown next to it in the Taxonomy list.
  const noteCounts: Record<string, number> = {}
  for (const n of data?.notes ?? []) for (const id of [n.service, ...n.zones]) if (id) noteCounts[id] = (noteCounts[id] ?? 0) + 1

  const load = useCallback(async () => {
    setError(null)
    try {
      const [n, t, p] = await Promise.all([
        kb<{ status: Loaded['status']; notes: NoteView[] }>('notes'),
        kb<{ taxonomy: Taxonomy; updatedAt: string | null }>('taxonomy'),
        kb<{ prompts: Record<PromptKey, PromptView> }>('prompts'),
      ])
      setData({ status: n.status, notes: n.notes, taxonomy: t.taxonomy, taxonomyUpdatedAt: t.updatedAt, prompts: p.prompts })
      setVersion((v) => v + 1)
    } catch (e) {
      setError(e instanceof KbError && e.status === 401 && mode !== 'account' ? 'ใส่ Access code ที่หน้า AI settings ก่อน' : e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    }
  }, [mode])
  useEffect(() => { void load() }, [load])

  async function importFiles() {
    setImportMsg(null)
    try {
      const r = await kb<{ added: number; skipped: number }>('import', { method: 'POST', body: {} })
      setImportMsg(`นำเข้าเพิ่ม ${r.added} note ข้าม ${r.skipped} (มีอยู่แล้วหรือเคยลบไป)`)
      await load()
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ')
    }
  }

  return (
    <>
      <PageHeader title="Product knowledge base" lead="ระบบประเมิน TOR ทีละขั้น: จัดหมวด requirement ด้วย Solution และ Service แล้วตัดสินแต่ละข้อด้วยสิ่งที่ Product ทำได้ (note) ส่วน prompt คือคำสั่งที่ส่งให้ AI ในแต่ละขั้น" />
      {/* The shell puts 40px between siblings; the banners, tabs and panel belong together, so they get one tighter column. */}
      <div className="flex flex-col gap-5">
      {error && <p role="alert" className="m-0 text-danger">{error} <Button variant="ghost" onClick={() => void load()}>ลองใหม่</Button></p>}
      {data && (
        <>
          {mode !== 'account' && <Alert tone="info" title="อ่านอย่างเดียว">ตอนนี้ยังไม่ได้เปิดระบบบัญชี จึงแก้ได้แค่ในไฟล์ kb/ ถ้าอยากแก้ในหน้านี้ ต้องตั้ง DATABASE_URL แล้วล็อกอินด้วยบัญชี admin</Alert>}
          {mode === 'account' && !admin && <Alert tone="info" title="ดูได้อย่างเดียว">คุณดูได้อย่างเดียว admin เท่านั้นที่แก้ note, taxonomy และ prompt ได้</Alert>}
          {mode === 'account' && data.status === 'defaults' && (
            <Alert tone="warning" title="ตอนนี้ใช้ค่าเริ่มต้น">
              {admin ? 'ระบบยังอ่านไฟล์ใน kb/ และ prompt ที่มากับระบบ เพราะฐานข้อมูลยังไม่พร้อม กดนำเข้าด้านล่าง (หรือรัน npm run db:init) แล้วสิ่งที่คุณแก้ถึงจะมีผลกับการประเมิน' : 'ระบบยังอ่านไฟล์ใน kb/ และ prompt ที่มากับระบบ สิ่งที่ admin แก้จะมีผลหลังตั้งค่าฐานข้อมูลเสร็จ'}
              {canEdit && <span className="mt-2 flex flex-wrap items-center gap-3"><Button variant="primary" onClick={importFiles}>นำเข้าจากไฟล์</Button>{importMsg && <span role="status" className="text-sm">{importMsg}</span>}</span>}
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div role="tablist" aria-label="หมวดความรู้" className="flex flex-wrap gap-2">
              {TABS.map(({ id, label }) => (
                <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)} className={`min-h-11 rounded-full border px-5 text-sm transition-colors ${tab === id ? 'border-ink bg-ink font-medium text-inverse' : 'border-line-strong bg-surface hover:border-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
            {canEdit && data.status === 'database' && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                {importMsg && <span role="status">{importMsg}</span>}
                <Button onClick={importFiles}>นำเข้า note ใหม่จากไฟล์</Button>
              </div>
            )}
          </div>
          <p className="m-0 max-w-3xl text-sm leading-6 text-muted">{TABS.find((t) => t.id === tab)?.about}</p>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
            {/* All three stay mounted (hidden), so a draft is not lost when you look at another tab. */}
            <div hidden={tab !== 'taxonomy'} role="region" aria-label="หมวด Taxonomy"><TaxonomyTab key={version} taxonomy={data.taxonomy} updatedAt={data.taxonomyUpdatedAt} admin={canEdit} reload={() => void load()} noteCounts={noteCounts} /></div>
            <div hidden={tab !== 'notes'} role="region" aria-label="หมวด Notes"><NotesTab key={version} notes={data.notes} taxonomy={data.taxonomy} admin={canEdit} reload={() => void load()} initial={selNote} onSelect={setSelNote} /></div>
            <div hidden={tab !== 'prompts'} role="region" aria-label="หมวด Prompts"><PromptsTab key={version} prompts={data.prompts} admin={canEdit} reload={() => void load()} /></div>
          </div>
        </>
      )}
      </div>
    </>
  )
}
