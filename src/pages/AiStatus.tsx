import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, CircleMinus } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { Button, Card, PageHeader } from '@/components/ui'
import type { PingResult, StatusInfo } from '@/lib/types'

const NAME = { anthropic: 'Claude (Anthropic)', gemini: 'Gemini (Google)' } as const

async function call<T>(code: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api/status', { ...init, headers: { ...init?.headers, 'x-access-code': code, 'content-type': 'application/json' } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

export default function AiStatus() {
  const { accessCode, setAccessCode } = useAssessmentStore()
  const [info, setInfo] = useState<StatusInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tests, setTests] = useState<Record<string, PingResult | 'running'>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setInfo(await call<StatusInfo>(accessCode))
    } catch (e) {
      setInfo(null)
      setError(e instanceof Error ? e.message : 'Could not load status')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (accessCode) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on arrival; later loads are explicit
  }, [])

  async function test(id: string) {
    setTests((t) => ({ ...t, [id]: 'running' }))
    try {
      const r = await call<PingResult>(accessCode, { method: 'POST', body: JSON.stringify({ provider: id }) })
      setTests((t) => ({ ...t, [id]: r }))
    } catch (e) {
      setTests((t) => ({ ...t, [id]: { ok: false, ms: 0, error: e instanceof Error ? e.message : 'Request failed' } }))
    }
  }

  return (
    <>
      <PageHeader crumb="Reference" title="AI status" action={info ? <Button onClick={load} disabled={loading}>Refresh</Button> : undefined} />
      {!info ? (
        <Card title="Access">
          <div className="flex flex-wrap items-end gap-3 p-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="stCode" className="font-medium">Access code</label>
              <input id="stCode" type="password" autoComplete="off" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && accessCode && load()} className="h-9 w-64 rounded-md border border-[#D9D9D9] px-[11px] text-sm" />
            </div>
            <Button variant="primary" disabled={!accessCode || loading} onClick={load}>{loading ? 'Checking…' : 'Check status'}</Button>
            {error && <p role="alert" className="m-0 w-full text-[#CF1322]">{error}</p>}
          </div>
        </Card>
      ) : (
        <>
          {info.error && <p role="alert" className="m-0 rounded-md border border-[#FFCCC7] bg-[#FFF2F0] px-4 py-3 text-[#CF1322]">{info.error}</p>}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
            {info.providers.map((p) => {
              const t = tests[p.id]
              return (
                <Card key={p.id}>
                  <div className="flex flex-col gap-3 px-6 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="m-0 text-base font-medium text-[#262626]">{NAME[p.id]}</h2>
                      {info.active === p.id && <span className="rounded border border-brand-line bg-brand-soft px-2 text-xs leading-5 text-brand-text">Active</span>}
                    </div>
                    <div className={`flex items-center gap-2 ${p.keySet ? 'text-[#237804]' : 'text-muted'}`}>
                      {p.keySet ? <CheckCircle2 aria-hidden size={18} /> : <CircleMinus aria-hidden size={18} />}
                      <span>{p.keySet ? 'Key is set' : 'Key not set'}</span>
                      <code className="text-xs text-muted">{p.envVar}</code>
                    </div>
                    <span className="text-xs text-muted">Model: <code>{p.model}</code></span>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button disabled={!p.keySet || t === 'running'} onClick={() => test(p.id)}>{t === 'running' ? 'Testing…' : 'Test connection'}</Button>
                      {t && t !== 'running' && (
                        <span role="status" className={`flex items-center gap-1.5 text-sm ${t.ok ? 'text-[#237804]' : 'text-[#CF1322]'}`}>
                          {t.ok ? <CheckCircle2 aria-hidden size={16} /> : <CircleAlert aria-hidden size={16} />}
                          {t.ok ? `Working · ${t.ms} ms` : t.error}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
          <p className="m-0 text-xs text-muted">ไม่แสดงค่า key ตั้งที่ <code>.env.local</code> หรือ Vercel env แล้ว deploy/รันใหม่ Test connection ส่งคำขอเล็กๆ 1 ครั้งและคิดเงินตาม provider</p>
        </>
      )}
    </>
  )
}
