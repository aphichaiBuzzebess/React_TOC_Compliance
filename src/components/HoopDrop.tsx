import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { BALL_R, COURT, DT, MAXPULL, SURE_SHOT, fly, preview, proj, shotFromPull, START, type Ball, type Shot } from '@/lib/hoop'

/** "PDF", "DOCX", "PNG"… from the file name: the lettering on the ball. */
const PILE_MAX = 5
const kind = (name: string) => (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)

/**
 * Basketball file drop (front view). Choose or drop files: the first file's icon is the ball and the others wait on the floor, so each file is shot on its own. Pull it toward you like a slingshot
 * (further = more power, sideways = aim) and let go. Through the hoop = the file is added. A miss brings it back.
 * "ยิงให้" and "ใส่เลย" are the keyboard and no-motion routes; with reduced motion the shot is not animated.
 */
export default function HoopDrop({ onScore, accept, disabled = false }: { onScore: (f: File) => void; accept: string; disabled?: boolean }) {
  const reduced = useReducedMotion()
  const [queue, setQueue] = useState<File[]>([])
  const [pose, setPose] = useState<Ball | null>(null) // null = in hand
  const [aim, setAim] = useState<{ dx: number; dy: number } | null>(null)
  const [flying, setFlying] = useState(false)
  const [returning, setReturning] = useState(false)
  const [misses, setMisses] = useState(0)
  const [sway, setSway] = useState(0)
  const [added, setAdded] = useState('')
  const [over, setOver] = useState(false)
  const svg = useRef<SVGSVGElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const raf = useRef(0)
  const timer = useRef(0)
  const drag = useRef<{ gx: number; gy: number } | null>(null)
  const aimNow = useRef(aim)
  aimNow.current = aim
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(timer.current) }, [])

  const file = queue[0]
  const busy = disabled || flying
  const enqueue = (list: File[]) => { if (list.length) { setQueue((q) => [...q, ...list]); setAdded(''); setMisses(0) } }

  const score = () => {
    onScore(file)
    setAdded(file.name)
    setQueue((q) => q.slice(1))
    setPose(null); setMisses(0)
  }
  const finish = (result: 'score' | 'miss') => {
    if (result === 'score') { setFlying(false); score(); return }
    setMisses((m) => m + 1); setReturning(true)
    timer.current = window.setTimeout(() => { setPose(null); timer.current = window.setTimeout(() => { setReturning(false); setFlying(false) }, 500) }, 400)
  }
  const shoot = (s: Shot) => {
    if (!file || busy) return
    const f = fly(s)
    setAim(null); setReturning(false)
    if (reduced) { if (f.result === 'score') score(); else setMisses((m) => m + 1); return }
    setFlying(true)
    const t0 = performance.now()
    let swayed = false
    const tick = (now: number) => {
      const i = Math.min(f.frames.length - 1, Math.floor((now - t0) / 1000 / DT))
      setPose(f.frames[i])
      if (!swayed && f.scoreAt !== null && i >= f.scoreAt) { swayed = true; setSway((n) => n + 1) }
      if (i >= f.frames.length - 1) { finish(f.result); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const courtPoint = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const k = COURT.w / r.width
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k }
  }
  const down = (e: PointerEvent) => {
    if (!file || busy) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = courtPoint(e)
    drag.current = { gx: p.x, gy: p.y }
    setPose(null); setAim({ dx: 0, dy: 0 })
  }
  const move = (e: PointerEvent) => {
    if (!drag.current) return
    const p = courtPoint(e)
    let dx = p.x - drag.current.gx, dy = p.y - drag.current.gy
    const len = Math.hypot(dx, dy)
    if (len > MAXPULL) { dx *= MAXPULL / len; dy *= MAXPULL / len }
    setAim({ dx, dy })
  }
  const up = () => {
    if (!drag.current) return
    drag.current = null
    const a = aimNow.current
    if (!a || a.dy < 14) { setAim(null); return }
    shoot(shotFromPull(a.dx, a.dy))
  }
  const dropFiles = (e: DragEvent) => {
    e.preventDefault(); setOver(false)
    if (!disabled) enqueue([...e.dataTransfer.files])
  }

  // Ball on the court: the pose, pulled back a quarter of the way while aiming.
  const b = pose ?? START
  const pr = proj(b.x, b.h, b.z)
  const r = BALL_R * pr.k
  const off = aim ? { x: aim.dx * 0.25, y: aim.dy * 0.25 } : { x: 0, y: 0 }
  const sh = proj(b.x, 0, b.z)
  const ballTransform = `translate(${(pr.x + off.x).toFixed(1)}px, ${(pr.y + off.y).toFixed(1)}px) rotate(${Math.round(b.rot * 0.25)}deg) scale(${(r * 0.03583).toFixed(4)}) translate(-24px, -30px)`
  const pv = aim ? preview(shotFromPull(aim.dx, aim.dy)) : null
  const power = aim ? Math.round(shotFromPull(aim.dx, aim.dy).p * 100) : 0
  const layer = b.z > 575 ? 'behind' : b.z > 470 ? 'mid' : 'front' // where the ball sits against the board and the net

  const ball = file && (
    <g aria-hidden>
      {b.h > BALL_R + 2 && <ellipse cx={sh.x} cy={sh.y} rx={r} ry={r * 0.3} className="fill-ink opacity-10" />}
      <g
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className={busy ? '' : 'cursor-grab active:cursor-grabbing'}
        style={{ touchAction: 'none', transform: ballTransform, transition: returning ? 'transform 0.5s cubic-bezier(0.215,0.61,0.355,1)' : undefined }}
      >
        <rect x="-26" y="-22" width="100" height="110" fill="transparent" />
        <g className="drop-shadow-sm">
          <path d="M2 2h30l14 14v42H2z" className="fill-surface stroke-line-strong" strokeWidth="2" strokeLinejoin="round" />
          <path d="M32 2v14h14" fill="none" className="stroke-line-strong" strokeWidth="2" strokeLinejoin="round" />
          <rect x="2" y="32" width="44" height="18" rx="2" className="fill-ink" />
          <text x="24" y="45.5" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-inverse">{kind(file.name)}</text>
        </g>
      </g>
    </g>
  )

  // The files waiting their turn lie on the floor beside the ball, up to five; "+N" stands for the rest.
  const waiting = queue.slice(1)
  const pile = waiting.slice(0, PILE_MAX).map((f, i) => (
    <g key={`${f.name}:${f.size}:${f.lastModified}`} transform={`translate(${392 + i * 40} 322) scale(0.7)`}>
      <path d="M2 2h30l14 14v42H2z" className="fill-surface stroke-line-strong" strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 2v14h14" fill="none" className="stroke-line-strong" strokeWidth="2" strokeLinejoin="round" />
      <rect x="2" y="32" width="44" height="18" rx="2" className="fill-ink" />
      <text x="24" y="45.5" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-inverse">{kind(f.name)}</text>
    </g>
  ))

  const status = !file
    ? added ? `เพิ่ม ${added} แล้ว เลือกหรือวางไฟล์ต่อได้` : 'เลือกไฟล์หรือวางลงที่สนาม ไอคอนไฟล์จะกลายเป็นลูกบาส แล้วดึงลงมายิงเข้าห่วง'
    : aim ? `แรง ${power}%${pv?.onTarget ? ' · เข้าเป้า' : ''} ปล่อยเพื่อยิง ดึงลงมากขึ้นแรงขึ้น ดึงไปข้างๆ เพื่อเล็ง`
      : misses ? 'พลาด ไฟล์กลับมาแล้ว ดึงลงมาลองใหม่' : `${file.name} พร้อมแล้ว ดึงไอคอนลงมาหาตัว เล็ง แล้วปล่อย${waiting.length ? ` · เหลืออีก ${waiting.length} ไฟล์ ยิงทีละไฟล์` : ''}`

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true) }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
        onDrop={dropFiles}
        className={`overflow-hidden rounded-lg border-2 border-dashed transition-colors ${over ? 'border-amber bg-amber-soft' : 'border-line-strong bg-tint'}`}
      >
        <svg ref={svg} role="group" aria-label="สนามบาส: ยิงไฟล์เข้าห่วงเพื่อเพิ่มไฟล์" viewBox={`0 0 ${COURT.w} ${COURT.h}`} className="block h-auto w-full select-none">
          <rect x="0" y="214" width={COURT.w} height="166" className="fill-line opacity-60" />
          {pile}
          {waiting.length > PILE_MAX && <text x={392 + PILE_MAX * 40 + 4} y="362" fontSize="16" fontWeight="600" className="fill-muted">+{waiting.length - PILE_MAX}</text>}
          {layer === 'behind' && ball}
          <rect x="310" y="106" width="8" height="137" className="fill-line-strong" />
          <rect x="251" y="8" width="126" height="98" rx="3" className="fill-surface stroke-ink" strokeWidth="3" />
          <rect x="292" y="58" width="44" height="34" fill="none" className="stroke-ink" strokeWidth="2" />
          <path d="M279 89 A35 7 0 0 1 349 89" fill="none" className="stroke-amber" strokeWidth="4" strokeLinecap="round" />
          {!file && <path d="M2 2h30l14 14v42H2z" transform="translate(290 320)" fill="none" className="stroke-line-strong" strokeWidth="2" strokeDasharray="4 4" />}
          {aim && <circle cx="314" cy="350" r={MAXPULL} fill="none" className="stroke-amber-line" strokeWidth="1.5" strokeDasharray="5 5" />}
          {pv?.pts.map((p, i) => {
            const q = proj(p.x, p.h, p.z)
            return <circle key={i} cx={q.x} cy={q.y} r={Math.max(1.5, 4.5 * q.k)} opacity={1 - i / (pv.pts.length + 6)} className={pv.onTarget ? 'fill-success' : 'fill-amber'} />
          })}
          {layer === 'mid' && ball}
          <g key={sway} className={sway ? 'hoop-net-sway' : undefined}>
            <path d="M281 91 L292 128 L336 128 L347 91 M281 91 L303 128 M292 94 L314 128 M303 96 L325 128 M314 96 L336 128 M325 96 L303 128 M336 94 L314 128 M347 91 L325 128 M286 110 L342 110" fill="none" className="stroke-muted" strokeWidth="1.5" />
            <path d="M279 89 A35 7 0 0 0 349 89" fill="none" className="stroke-amber" strokeWidth="4" strokeLinecap="round" />
          </g>
          {layer === 'front' && ball}
        </svg>
      </div>
      <p aria-live="polite" className="m-0 min-h-10 text-sm text-muted">{status}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          aria-label="เลือกไฟล์ TOR"
          className="sr-only"
          onChange={(e) => { enqueue([...(e.target.files ?? [])]); e.target.value = '' }}
        />
        {file ? (
          <>
            <Button variant="primary" disabled={busy} onClick={() => shoot(SURE_SHOT)}>ยิงให้</Button>
            <Button disabled={busy} onClick={score}>ใส่ไฟล์เลย</Button>
            <Button variant="ghost" disabled={busy} onClick={() => input.current?.click()}>เพิ่มไฟล์</Button>
          </>
        ) : (
          <Button variant="primary" disabled={disabled} onClick={() => input.current?.click()}>เลือกไฟล์</Button>
        )}
      </div>
    </div>
  )
}
