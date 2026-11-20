import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { kb, when, KbError } from './kbFetch'

interface Version { id: number; at: string; by: string; data: unknown }
const preview = (d: unknown) => {
  const o = (d ?? {}) as { body?: string; title?: string; zones?: unknown[]; services?: unknown[] }
  if (typeof o.body === 'string') return `${o.title ? `${o.title}: ` : ''}${o.body}`.slice(0, 160)
  if (o.services) return `zone ${o.zones?.length ?? 0} · service ${o.services.length}`
  return ''
}

/** The last 20 versions of one item (admins only), and a restore button. `token` is the version of the live item (null when it is deleted). */
export default function Versions({ kind, itemKey, token, onRestored, onClose }: { kind: 'note' | 'prompt' | 'taxonomy'; itemKey: string; token: string | null; onRestored: () => void; onClose: () => void }) {
  const [list, setList] = useState<Version[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    kb<{ versions: Version[] }>('versions', { query: { kind, key: itemKey } }).then((r) => setList(r.versions), (e: unknown) => setError(e instanceof Error ? e.message : 'โหลดเวอร์ชันไม่สำเร็จ'))
  }, [kind, itemKey])

  async function restore(id: number) {
    setError(null)
    try {
      await kb('restore', { method: 'POST', body: { id, updatedAt: token } })
      onRestored()
    } catch (e) {
      setError(e instanceof KbError ? e.message : 'กู้คืนไม่สำเร็จ')
    }
  }

  return (
    <section aria-label="เวอร์ชันย้อนหลัง" className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-base font-medium">เวอร์ชันย้อนหลัง (ล่าสุด 20 รุ่น)</h3>
        <Button variant="ghost" onClick={onClose}>ปิด</Button>
      </div>
      {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
      {list === null && !error && <p role="status" className="m-0 text-sm text-muted">กำลังโหลด…</p>}
      {list?.length === 0 && <p className="m-0 text-sm text-muted">ยังไม่มีเวอร์ชันเก่า (ยังไม่เคยถูกแก้)</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list?.map((v) => (
          <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{when(v.at)} · {v.by || 'ไม่ทราบ'}</div>
              <div className="text-sm wrap-anywhere">{preview(v.data)}</div>
            </div>
            <Button onClick={() => restore(v.id)} aria-label={`กู้คืนเวอร์ชัน ${when(v.at)}`}>กู้คืน</Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
