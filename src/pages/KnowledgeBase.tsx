import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { Button, Card, PageHeader, StatusBadge } from '@/components/ui'
import type { Note } from '../../server/kb'

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

export default function KnowledgeBase() {
  const { accessCode, setAccessCode } = useAssessmentStore()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/kb', { headers: accessCode ? { 'x-access-code': accessCode } : {} })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
      setNotes(body.notes)
      setSel((s) => s ?? body.notes[0]?.path ?? null)
    } catch (e) {
      setNotes(null)
      setError(e instanceof Error ? e.message : 'Could not load the knowledge base')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on arrival; later loads are explicit
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = (notes ?? []).filter((n) => !q || `${n.title} ${n.module} ${n.body}`.toLowerCase().includes(q))
    const by = new Map<string, Note[]>()
    for (const n of hits) by.set(n.module, [...(by.get(n.module) ?? []), n])
    return [...by]
  }, [notes, query])
  const note = notes?.find((n) => n.path === sel)

  return (
    <>
      <PageHeader title="Product knowledge base" lead="ความรู้ของ Product ที่ระบบใช้เป็นหลักฐานตอนประเมิน อ่านอย่างเดียว แก้ใน Obsidian" />
      {!notes ? (
        <Card title="Access">
          <div className="flex flex-wrap items-end gap-3 p-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="kbCode" className="font-medium">Access code <span className="font-normal text-muted">(ถ้าผู้ดูแลระบบกำหนด)</span></label>
              <input id="kbCode" type="password" autoComplete="off" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && accessCode && load()} className="h-11 w-64 rounded-lg border border-line-strong px-[11px] text-sm" />
            </div>
            <Button variant="primary" disabled={!accessCode || loading} onClick={load}>{loading ? 'Loading…' : 'Open knowledge base'}</Button>
            {error && <p role="alert" className="m-0 w-full text-[#CF1322]">{error}</p>}
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <Card className="flex-[1_1_280px]">
            <div className="flex flex-col gap-3 p-4">
              <label htmlFor="kbq" className="sr-only">Search notes</label>
              <input id="kbq" type="search" placeholder={`Search ${notes.length} notes`} value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 rounded-lg border border-line-strong px-[11px] text-sm" />
              {groups.length === 0 && <p className="m-0 py-4 text-center text-muted">No matching note</p>}
              {groups.map(([module, items]) => (
                <div key={module} className="flex flex-col gap-1">
                  <span className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{module}</span>
                  {items.map((n) => (
                    <button key={n.path} type="button" onClick={() => setSel(n.path)} aria-current={n.path === sel} className={`flex min-h-10 items-center justify-between gap-2 rounded-md border-0 px-3 text-left text-sm ${n.path === sel ? 'bg-brand-soft font-medium text-brand-text' : 'bg-transparent hover:bg-[#FAFAFA]'}`}>
                      <span className="min-w-0 truncate">{n.title}</span>
                      <span className="size-2 flex-none rounded-full" style={{ background: { full: '#52C41A', config: '#1677FF', custom: '#FAAD14', integ: '#434343', none: '#FF4D4F', verify: '#BFBFBF' }[n.support] }} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Card>
          <Card className="min-w-0 flex-[999_1_480px]">
            {note ? (
              <div className="flex flex-col gap-4 p-6">
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[13px] text-brand-text">{note.path}</span>
                  <h2 className="m-0 text-2xl font-medium text-ink">{note.title}</h2>
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge s={note.support} /><span className="text-xs text-muted">{note.module} · updated {note.updated}</span></div>
                </div>
                <p className="m-0 whitespace-pre-wrap leading-[1.7]"><Body text={note.body} open={setSel} /></p>
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-muted">Select a note</div>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
