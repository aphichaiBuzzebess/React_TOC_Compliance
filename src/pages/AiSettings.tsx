import { useState } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { authHeaders, useAssessmentStore } from '@/store/useAssessmentStore'
import { AI_PROVIDERS } from '@/data/models'
import { Alert, Button, Card, PageHeader } from '@/components/ui'
import type { PingResult } from '@/lib/types'

const CUSTOM = '__custom'
const INPUT = 'h-11 w-full max-w-md rounded-lg border border-line-strong px-[11px] text-sm'
const SELECT = 'h-11 w-full max-w-md rounded-lg border border-line-strong bg-surface text-sm' // padding and chevron come from index.css

export default function AiSettings() {
  const s = useAssessmentStore()
  const prov = AI_PROVIDERS.find((p) => p.id === s.provider)!
  const [custom, setCustom] = useState(!prov.models.includes(s.model))
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<PingResult | null>(null)
  const [keyMsg, setKeyMsg] = useState<string | null>(null)
  const account = s.mode === 'account'

  async function test() {
    setTesting(true)
    setResult(null)
    try {
      const res = await fetch('/api/status', { method: 'POST', headers: authHeaders(s) })
      const body = await res.json().catch(() => ({}))
      setResult(res.ok ? body : { ok: false, ms: 0, error: body.error ?? `Request failed (${res.status})` })
    } catch {
      setResult({ ok: false, ms: 0, error: 'Could not reach the server' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <PageHeader title="AI settings" lead={account ? 'เลือก AI และโมเดล แล้วบันทึก API key ของคุณ key ถูกเข้ารหัสบน server และไม่แสดงอีก ค่าใช้จ่ายเป็นของบัญชีคุณ' : 'เลือก AI และโมเดล แล้วใส่ API key ของคุณเอง key ไม่ถูกเก็บ ค่าใช้จ่ายเป็นของบัญชีคุณ'} />
      <Card title="Provider and model">
        <div className="flex flex-col gap-5 p-6">
          {s.serverDefault && (
            <Alert tone="info" title="เซิร์ฟเวอร์มี AI ตั้งไว้ให้แล้ว">
              {AI_PROVIDERS.find((p) => p.id === s.serverDefault?.provider)?.label} · {s.serverDefault.model} ไม่ต้องใส่ key ก็รันได้ ถ้าใส่ key ของตัวเองด้านล่าง ระบบจะใช้ key และ model ที่คุณเลือกแทน
            </Alert>
          )}
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 p-0 font-medium">AI provider</legend>
            {AI_PROVIDERS.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="provider" checked={s.provider === p.id} onChange={() => { s.setProvider(p.id); setCustom(false); setResult(null) }} className="size-4 accent-brand" />
                {p.label}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor="model" className="font-medium">Model</label>
            <select id="model" value={custom ? CUSTOM : s.model} onChange={(e) => { if (e.target.value === CUSTOM) { setCustom(true); s.setModel('') } else { setCustom(false); s.setModel(e.target.value) } setResult(null) }} className={SELECT}>
              {prov.models.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value={CUSTOM}>Custom…</option>
            </select>
            {prov.textOnly && <p className="m-0 text-sm text-muted">{prov.label} อ่านได้เฉพาะข้อความ: ใช้กับไฟล์ DOCX และ XLSX ได้ แต่ PDF และรูปภาพต้องใช้ Claude, Gemini หรือ ChatGPT</p>}
            {custom && <input aria-label="Custom model id" type="text" placeholder="model id" value={s.model} onChange={(e) => s.setModel(e.target.value.trim())} className={INPUT} />}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="apiKey" className="font-medium">{prov.keyLabel}</label>
            <input id="apiKey" type="password" autoComplete="off" spellCheck={false} placeholder="วาง key ของคุณ" value={s.apiKey} onChange={(e) => s.setApiKey(e.target.value)} className={INPUT} />
            {account ? (
              <>
                {s.storedKey && (
                  <p role="status" className="m-0 flex flex-wrap items-center gap-3 text-sm">
                    บันทึกไว้แล้ว: {AI_PROVIDERS.find((p) => p.id === s.storedKey?.provider)?.label} · {s.storedKey.model} · <span aria-label={`ลงท้ายด้วย ${s.storedKey.last4}`}>••••{s.storedKey.last4}</span>
                    <Button variant="danger" onClick={() => void s.removeKey()}>ลบ key ที่บันทึก</Button>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={!s.apiKey || !s.model} onClick={async () => setKeyMsg((await s.saveKey(s.apiKey)) ?? 'บันทึกแล้ว')}>{s.storedKey ? 'เปลี่ยน key ที่บันทึก' : 'บันทึก key'}</Button>
                  {keyMsg && <span role="status" className="text-sm text-muted">{keyMsg}</span>}
                </div>
                <span className="text-xs text-muted">key ถูกส่งไปบันทึกครั้งเดียว เข้ารหัสบน server และไม่ถูกส่งกลับมาที่เบราว์เซอร์อีก ใช้ provider และ model ที่เลือกไว้ด้านบน</span>
              </>
            ) : (
              <span className="text-xs text-muted">Key ไม่ถูกบันทึก อยู่ในหน้านี้เท่านั้นและหายเมื่อรีเฟรช ส่งไปที่ server เฉพาะตอนเรียก AI แต่ละครั้ง ค่าใช้จ่ายเป็นของบัญชีคุณ</span>
            )}
          </div>

          {!account && <div className="flex flex-col gap-2">
            <label htmlFor="access" className="font-medium">Access code <span className="font-normal text-muted">(ถ้าผู้ดูแลระบบกำหนด)</span></label>
            <input id="access" type="password" autoComplete="off" value={s.accessCode} onChange={(e) => s.setAccessCode(e.target.value)} className={INPUT} />
          </div>}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={(!s.apiKey && !s.serverDefault && !s.storedKey) || !s.model || testing} onClick={test}>{testing ? 'Testing…' : 'Test connection'}</Button>
            {result && (
              <span role="status" className={`flex items-center gap-1.5 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
                {result.ok ? <CheckCircle2 aria-hidden size={16} /> : <CircleAlert aria-hidden size={16} />}
                {result.ok ? `Working · ${s.apiKey ? s.model : (s.storedKey?.model ?? s.serverDefault?.model)} · ${result.ms} ms` : result.error}
              </span>
            )}
          </div>
          <span className="text-xs text-muted">Test connection ส่งคำขอเล็กๆ 1 ครั้งด้วย key ของคุณ</span>
        </div>
      </Card>
    </>
  )
}
