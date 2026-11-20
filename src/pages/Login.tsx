import { useState, type FormEvent } from 'react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { Button, Card, PageHeader } from '@/components/ui'

const INPUT = 'h-11 w-full max-w-md rounded-lg border border-line-strong px-[11px] text-sm'

export default function Login() {
  const { signIn, signUp } = useAssessmentStore()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = mode === 'in' ? await signIn(username, password) : await signUp(username, password, code)
    setBusy(false)
    if (err) setError(err)
    else { setPassword(''); setCode('') }
  }

  return (
    <>
      <PageHeader title="Sign in" lead="ล็อกอินเพื่อใช้ AI key ที่บันทึกไว้และดูประวัติการ review ของคุณ ข้อมูลเห็นได้เฉพาะเจ้าของบัญชี" />
      <Card title={mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}>
        <form onSubmit={submit} className="flex flex-col gap-5 p-6">
          <div className="flex gap-2" role="group" aria-label="โหมด">
            {(['in', 'up'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setError(null) }} className={`min-h-11 rounded-full border px-4 text-[13px] transition-colors ${mode === m ? 'border-ink bg-ink font-medium text-inverse' : 'border-line-strong bg-surface hover:border-ink'}`}>
                {m === 'in' ? 'มีบัญชีแล้ว' : 'สมัครใหม่'}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="font-medium">ชื่อผู้ใช้</label>
            <input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} className={INPUT} />
            {mode === 'up' && <span className="text-xs text-muted">3-40 ตัว ใช้ a-z 0-9 . _ @ - ไม่สนตัวพิมพ์เล็กใหญ่</span>}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="font-medium">รหัสผ่าน</label>
            <input id="password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
            {mode === 'up' && <span className="text-xs text-muted">อย่างน้อย 10 ตัวอักษร</span>}
          </div>
          {mode === 'up' && (
            <div className="flex flex-col gap-2">
              <label htmlFor="code" className="font-medium">รหัสทีม</label>
              <input id="code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} className={INPUT} />
              <span className="text-xs text-muted">ขอรหัสทีมจากผู้ดูแลระบบ</span>
            </div>
          )}
          {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
          <div><Button variant="primary" arrow type="submit" disabled={busy || !username || !password || (mode === 'up' && !code)}>{busy ? 'กำลังดำเนินการ…' : mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครและเข้าสู่ระบบ'}</Button></div>
        </form>
      </Card>
    </>
  )
}
