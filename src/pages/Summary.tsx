import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, Copy } from 'lucide-react'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import { ORDER, STATUS } from '@/data/tor'
import { orderedModules, catRank } from '@/data/categories'
import { useAssessment } from '@/lib/useAssessment'
import { exportPdf } from '@/lib/exportPdf'
import { buildSolution, type Counts, type Line } from '@/lib/solution'
import { featureOf } from '@/lib/evidence'
import { GROUPS, SEVERITY, VERDICT, VERDICT_ORDER, bySeverity, groupOf, headline, score, why, type Score } from '@/lib/verdict'
import type { Assessment } from '@/lib/assessment'
import type { Req } from '@/lib/types'
import { Button, EmptyState } from '@/components/ui'
import { BarButtons, Dot, ReqDrawer, St, Verdict, dealBreaker } from '@/components/tor'
import ResultHead from '@/components/ResultHead'
import { QuestionsPanel } from '@/pages/Questions'

const SHORT: Record<keyof Counts, string> = { full: 'ทำได้เลย', config: 'ตั้งค่า', custom: 'พัฒนาเพิ่ม', integ: 'เชื่อมต่อ', none: 'ไม่รองรับ', verify: 'รอยืนยัน' }
const WORK_SHORT = { config: 'ตั้งค่า', custom: 'พัฒนาเพิ่ม', integ: 'เชื่อมระบบ' } as const
const FEAT_SHOWN = 8

/** Status counts as small dots with a number: only the statuses that occur. */
function Breakdown({ by }: { by: Counts }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {ORDER.filter((k) => by[k] > 0).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className="size-2 rounded-full" style={{ background: STATUS[k].dot }} />
          {SHORT[k]} {by[k]}
        </span>
      ))}
    </span>
  )
}

function ToolRow({ l }: { l: Line }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <span className={l.kind === 'tool' ? 'text-ink' : 'text-muted'}>
        {l.label} <span className="text-muted">· {l.total} ข้อ</span>
      </span>
      <Breakdown by={l.byStatus} />
    </li>
  )
}

/** A section of the page: a rule above, a title and a short line on what it is for. */
function Sec({ id, title, lead, right, children }: { id: string; title: string; lead?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col border-t border-line py-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <h2 id={id} className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {lead && <p className="m-0 text-sm text-muted">{lead}</p>}
        {right}
      </div>
      {children}
    </section>
  )
}

/** One requirement in a list: its id, the text and one line under it. Opens the drawer. */
function Item({ r, sub, onOpen }: { r: Req; sub: string; onOpen: (id: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(r.id)} className="-mx-2.5 grid w-[calc(100%+20px)] grid-cols-[44px_minmax(0,1fr)] gap-1.5 rounded-xl border-0 bg-transparent px-2.5 py-[11px] text-left transition-colors hover:bg-tint">
        <span className="pt-0.5 font-mono text-[13px] text-muted">{r.id}</span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium leading-normal text-ink wrap-anywhere">{r.text}</span>
          {sub && <span className="mt-0.5 block text-[13.5px] text-muted wrap-anywhere">{sub}</span>}
        </span>
      </button>
    </li>
  )
}

function Column({ dot, title, n, sub, right, items, empty }: { dot: CSSProperties; title: string; n: number; sub: string; right?: ReactNode; items: ReactNode; empty: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-h-[34px] items-center justify-between gap-2.5">
        <h3 className="m-0 flex items-center gap-2.5 text-base font-semibold text-ink"><i aria-hidden className="inline-block size-2 rounded-full" style={dot} />{title}</h3>
        {right}
      </div>
      <p className="m-0 mb-1.5 mt-3.5 text-[44px] font-semibold leading-none tracking-[-0.045em] text-ink tabular-nums">{n}</p>
      <p className="m-0 mb-3.5 text-sm text-muted">{sub}</p>
      {n ? <ul className="m-0 list-none p-0">{items}</ul> : <p className="m-0 py-2.5 text-[14.5px] text-muted">{empty}</p>}
    </div>
  )
}

function Hero({ s }: { s: Score }) {
  const w = why(s)
  return (
    <section aria-label="ผลการประเมิน" className="grid items-end gap-x-10 gap-y-6 pb-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <p className="m-0 whitespace-nowrap text-[clamp(80px,10vw,136px)] font-semibold leading-[0.82] tracking-[-0.065em] text-ink tabular-nums" aria-label={`รองรับได้ ${s.cov}%`}>
          {s.cov}<span className="ml-[0.08em] align-[0.95em] text-[0.38em] tracking-[-0.02em] text-muted">%</span>
        </p>
        <p className="m-0 mt-[18px] text-[15px] text-muted">รองรับได้ {s.okN} จาก {s.evaluable} ข้อที่ประเมินได้</p>
      </div>
      <div className="flex flex-col">
        <Verdict v={s.verdict} className="text-[15px]" />
        <p className="m-0 mt-3.5 max-w-[30ch] text-[22px] font-medium leading-[1.38] tracking-[-0.02em] text-ink sm:text-[27px]">{headline(s)}</p>
        <div className="mt-5 flex flex-wrap gap-8">
          <div><b className="block text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{s.mandPass}/{s.mandTotal}</b><span className="text-[13.5px] text-muted">ข้อบังคับที่รองรับได้</span></div>
          <div><b className="block text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{s.ready}%</b><span className="text-[13.5px] text-muted">พร้อมใช้ทันที</span></div>
          <div><b className="block text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">{s.g.work}</b><span className="text-[13.5px] text-muted">ข้อที่มีงานเพิ่ม</span></div>
        </div>
        <details className="group mt-5 max-w-[560px]">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 border-b border-line-strong pb-px text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">ผลนี้มาจากอะไร</summary>
          <div className="mt-3.5 rounded-card bg-tint px-5 py-[18px]">
            <p className="m-0 mb-3 text-[15px] font-medium text-ink">TOR นี้{w.why.replace(/^เพราะ/, '')} จึงได้ผล "{VERDICT[s.verdict].label}"</p>
            <ul className="m-0 flex list-none flex-col p-0">
              {VERDICT_ORDER.map((k) => (
                <li key={k} className={`-mx-3 grid gap-x-4 gap-y-0.5 rounded-xl px-3 py-2.5 sm:grid-cols-[170px_minmax(0,1fr)] ${k === s.verdict ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]' : 'text-muted'}`}>
                  <Verdict v={k} muted={k !== s.verdict} className="text-sm sm:row-span-2" />
                  <span className="text-sm">{VERDICT[k].rule}</span>
                  <span className="text-[13px] text-muted">{VERDICT[k].act}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-3 text-[13px] text-muted">รองรับได้ % = ข้อที่พร้อมใช้และข้อที่มีงานเพิ่ม หารด้วยข้อที่ประเมินได้ ไม่นับข้อที่ต้องตรวจสอบและเงื่อนไขสัญญา</p>
          </div>
        </details>
      </div>
    </section>
  )
}

/** One bar per requirement in four groups, lightest to heaviest; height says how much it matters. Each bar opens that requirement. */
function Strip({ a, s, onOpen }: { a: Assessment; s: Score; onOpen: (id: string) => void }) {
  return (
    <section aria-label="requirement ทุกข้อ แยกตามผล" className="border-t border-line pb-6 pt-5 [container-type:inline-size]">
      <h2 className="sr-only">ผลรายข้อ</h2>
      <div className="flex flex-wrap items-start gap-x-7 gap-y-5">
        {GROUPS.map((g) => ({ g, items: bySeverity(a.reqs.filter((r) => groupOf(r.s) === g.k)) }))
          .filter((x) => x.items.length)
          .map(({ g, items }) => (
            <div key={g.k} className="flex min-w-[96px] flex-col gap-3.5">
              {/* As wide as the row allows for this many bars: 4 to 24px each, like a bar chart that fills the page. */}
              <BarButtons reqs={items} onOpen={onOpen} size={150} gap={6} width={`clamp(4px, calc((100cqw - 108px) / ${a.total} - 6px), 24px)`} />
              <div className="flex items-baseline gap-[7px] whitespace-nowrap text-sm text-muted"><b className="text-xl font-semibold tracking-[-0.02em] text-ink tabular-nums">{items.length}</b>{g.label}</div>
              {g.k === 'work' ? (
                <div className="-mt-2 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[13px] text-muted">
                  {(['config', 'custom', 'integ'] as const).filter((k) => s.by[k]).map((k) => <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap"><Dot s={k} />{WORK_SHORT[k]} {s.by[k]}</span>)}
                </div>
              ) : (
                <p className="-mt-2 m-0 max-w-[230px] text-[13px] leading-snug text-muted">{g.desc}</p>
              )}
            </div>
          ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-[22px] gap-y-1.5 text-[13px] text-muted">
        <span className="min-w-[150px] font-medium text-ink">สีบอกความหนัก</span>
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-[12.5px]">เบา</span>
          {SEVERITY.slice(0, 5).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block size-3 rounded" style={{ background: STATUS[k].dot }} />{STATUS[k].th}</span>)}
          <span className="text-[12.5px]">หนัก</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-[22px] gap-y-1.5 text-[13px] text-muted">
        <span className="min-w-[150px] font-medium text-ink">ความสูงบอกความสำคัญ</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="inline-flex h-4 items-end"><i className="block h-[16px] w-1.5 rounded-full bg-ink" /></span>ข้อบังคับ (TOR ใช้คำว่า "ต้อง")</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="inline-flex h-4 items-end"><i className="block h-2 w-1.5 rounded-full bg-ink opacity-45" /></span>ไม่บังคับ ("ควร") แท่งเตี้ยและสีอ่อน</span>
        <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block size-1.5 rounded-full bg-ink" />ข้อบังคับที่ไม่รองรับ</span>
      </div>
    </section>
  )
}

/** What the TOR asks for that we have: the requirement, the feature of ours it maps to, and the verdict. */
function Matches({ a, onOpen }: { a: Assessment; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false)
  const can = a.reqs
    .filter((r) => (groupOf(r.s) === 'ready' || groupOf(r.s) === 'work') && featureOf(r.evidence))
    .sort((x, y) => catRank(x.module) - catRank(y.module) || SEVERITY.indexOf(x.s) - SEVERITY.indexOf(y.s))
  if (!can.length) return null
  const nFeat = new Set(can.map((r) => featureOf(r.evidence)!.title)).size
  const shown = all ? can : can.slice(0, FEAT_SHOWN)
  const grid = 'grid grid-cols-1 gap-x-5 gap-y-1 md:grid-cols-[minmax(0,1.6fr)_24px_minmax(0,1fr)_170px] md:items-center'
  return (
    <Sec id="feat-h" title="ตรงกับ product ที่เรามี" lead={`${can.length} ข้อที่รองรับได้ ใช้ ${nFeat} feature ของเรา คลิกแถวเพื่อดูหลักฐาน`}>
      <div className={`${grid} hidden border-b border-line px-3 pb-2.5 text-[13px] text-muted md:grid`}>
        <span>TOR ขอ</span><span /><span>เรามี</span><span>ผล</span>
      </div>
      {shown.map((r) => {
        const f = featureOf(r.evidence)!
        return (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)} className={`${grid} w-full border-0 border-b border-line bg-transparent px-3 py-3.5 text-left transition-colors hover:bg-tint`}>
            <span className="min-w-0 text-[15px] text-ink wrap-anywhere"><span className="mr-2 font-mono text-[13px] text-muted">{r.id}</span>{r.text}</span>
            <ArrowRight aria-hidden size={18} className="hidden text-muted md:block" />
            <span className="flex min-w-0 flex-col font-medium text-ink wrap-anywhere">{f.title}<small className="text-[13px] font-normal text-muted">{f.module}</small></span>
            <St s={r.s} />
          </button>
        )
      })}
      {can.length > FEAT_SHOWN && <div className="mt-5"><Button variant="ghost" onClick={() => setAll(!all)}>{all ? 'ย่อ' : `ดูทั้งหมด ${can.length} ข้อ`}</Button></div>}
    </Sec>
  )
}

function SummaryContent({ a }: { a: Assessment }) {
  const confirmed = useAssessmentStore((s) => Object.values(s.valid).filter((v) => v === 'ok').length)
  const customer = useAssessmentStore((s) => s.customer)
  const title = useAssessmentStore((s) => s.project.title)
  const taxonomy = useAssessmentStore((s) => s.taxonomy)
  const terms = useAssessmentStore((s) => s.terms)
  const setTermOk = useAssessmentStore((s) => s.setTermOk)
  const sol = useMemo(() => buildSolution(a.reqs, taxonomy), [a.reqs, taxonomy])
  const s = useMemo(() => score(a.reqs), [a.reqs])
  const page = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const order = useMemo(() => bySeverity(a.reqs).map((r) => r.id), [a.reqs])

  async function download() {
    if (!page.current) return
    setBusy(true)
    setError(null)
    try {
      await exportPdf(page.current, `${(title || customer || 'TOR').replace(/[^\p{L}\p{N}_-]+/gu, '_')}_executive_summary_${today}.pdf`)
    } catch {
      setError('สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  const breakers = a.reqs.filter(dealBreaker)
  const asks = a.reqs.filter((r) => r.q || r.s === 'verify')
  const work = a.reqs.filter((r) => r.s === 'custom' || r.s === 'integ')
  const copyQs = async () => {
    try {
      await navigator.clipboard.writeText(asks.map((r) => `${r.id} ${r.text}\n- ${r.q || r.gap || 'ตรวจสอบข้อมูลเพิ่มเติม'}`).join('\n\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the list is still on screen */
    }
  }

  return (
    <>
      <ResultHead action={<Button disabled={busy} onClick={download}>{busy ? 'กำลังสร้าง PDF…' : 'Download PDF'}</Button>} />
      {error && <p role="alert" className="m-0 text-danger">{error}</p>}
      <div ref={page} className="flex flex-col bg-canvas">
        <span className="pdf-only mb-6 text-xs text-muted">TOR Scouter · {[title, customer].filter(Boolean).join(' · ') || 'Customer TOR'} · {today}</span>
        <Hero s={s} />
        <Strip a={a} s={s} onOpen={setOpen} />
        <Matches a={a} onOpen={setOpen} />

        <section aria-label="สิ่งที่ต้องทำต่อ" className="grid gap-8 border-t border-line py-6 lg:grid-cols-3">
          <Column dot={{ background: STATUS.none.dot }} title="ต้องตัดสินใจ" n={breakers.length} sub="ข้อบังคับที่ยังไม่รองรับ ตกลงกับลูกค้าหรือวางแผนพัฒนาก่อนยื่น" empty="ไม่มี"
            items={breakers.map((r) => <Item key={r.id} r={r} sub={r.rec || r.gap || ''} onOpen={setOpen} />)} />
          <Column dot={{ boxShadow: `inset 0 0 0 2px ${STATUS.verify.dot}` }} title="ถามลูกค้า" n={asks.length} sub="คำตอบจะเปลี่ยนผลของข้อเหล่านี้" empty="ไม่มีคำถามค้าง"
            right={asks.length > 0 && <Button variant="ghost" onClick={copyQs}><Copy size={15} aria-hidden />{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</Button>}
            items={asks.map((r) => <Item key={r.id} r={r} sub={r.q || r.gap || 'ตรวจสอบข้อมูลเพิ่มเติม'} onOpen={setOpen} />)} />
          <Column dot={{ background: STATUS.integ.dot }} title="ต้องพัฒนาหรือเชื่อมระบบ" n={work.length} sub={s.by.config ? `อีก ${s.by.config} ข้อแค่ตั้งค่า ไม่ต้องพัฒนา` : 'ไม่มีข้อที่แค่ตั้งค่า'} empty="ไม่มี"
            items={work.map((r) => <Item key={r.id} r={r} sub={`${STATUS[r.s].th}${r.gap ? `: ${r.gap}` : ''}`} onOpen={setOpen} />)} />
        </section>

        <Sec id="cat-h" title="รายหมวด" lead="ใช้ดูว่าหมวดไหนอ่อน">
          <div className="grid gap-x-10 md:grid-cols-2">
            {orderedModules(a.reqs).map((m) => {
              const items = a.reqs.filter((r) => r.module === m)
              const ok = items.filter((r) => groupOf(r.s) === 'ready' || groupOf(r.s) === 'work').length
              const ev = items.filter((r) => r.s !== 'verify').length
              return (
                <div key={m} className="grid grid-cols-[minmax(0,1fr)_auto_120px] items-center gap-5 border-t border-line py-3 md:[&:nth-child(-n+2)]:border-t-0">
                  <span className="font-medium text-ink wrap-anywhere">{m}</span>
                  <BarButtons reqs={bySeverity(items)} onOpen={setOpen} size={36} gap={3} width="8px" />
                  <span className="text-right text-sm text-muted tabular-nums">{ev ? <><b className="font-semibold text-ink">{ok}</b> / {ev} รองรับได้</> : 'รอตรวจสอบ'}</span>
                </div>
              )
            })}
          </div>
        </Sec>

        <Sec id="terms-h" title="เงื่อนไขสัญญาและคุณสมบัติผู้ยื่น" lead={`ตรวจแล้ว ${terms.filter((t) => t.ok).length} จาก ${terms.length} ข้อ`}>
          <p className="-mt-1.5 m-0 mb-3 max-w-[72ch] text-[14.5px] text-muted">ข้อใน TOR ที่ไม่ใช่ฟีเจอร์ของ product เช่น ผลงานที่ผ่านมา ระยะเวลาส่งมอบ การรับประกัน การชำระเงิน ระบบจึงไม่เทียบกับ Knowledge Base ให้ BD ติ๊กเมื่อตรวจแล้วว่าเราทำตามได้</p>
          {terms.length ? (
            <div className="flex flex-col">
              {terms.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-3.5 border-t border-line py-3 first:border-t-0">
                  <input type="checkbox" checked={!!t.ok} onChange={(e) => setTermOk(t.id, e.target.checked)} className="mt-0.5 size-5 flex-none accent-[var(--color-ink)]" />
                  <span>
                    <span className={`block font-medium ${t.ok ? 'text-muted line-through' : 'text-ink'}`}>{t.text}</span>
                    {t.ref && <span className="block text-[13.5px] text-muted">{t.ref}</span>}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="m-0 py-2.5 text-[14.5px] text-muted">ไม่มี</p>
          )}
        </Sec>

        {sol.solutions.length > 0 && (
          <section aria-labelledby="solution-h" className="flex flex-col gap-3 border-t border-line py-6">
            <h2 id="solution-h" className="m-0 text-xl font-semibold tracking-[-0.02em] text-ink">สิ่งที่ต้องทำ และ tool ของ Buzzebees ที่ต้องใช้</h2>
            <p className="m-0 text-sm text-muted">
              ข้อหนึ่งนับในทุก tool ที่เกี่ยวข้อง จึงรวมกันได้มากกว่า {sol.total} ข้อ
              {sol.tools.length > 0 && <> · Tool ทั้งโปรเจกต์: {sol.tools.map((t) => `${t.label} (${t.total})`).join(', ')}</>}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {sol.solutions.map((z) => (
                <section key={z.solution} aria-label={`Solution ${z.label}`} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="m-0 text-base font-semibold text-ink">{z.label}</h3>
                    <span className="text-xs text-muted">{z.total} ข้อ</span>
                  </div>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                    {z.lines.map((l) => <ToolRow key={l.service} l={l} />)}
                  </ul>
                </section>
              ))}
            </div>
            {(sol.build > 0 || sol.api > 0 || sol.untagged > 0) && (
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
                {sol.build > 0 && <li>พัฒนาใหม่ {sol.build} ข้อ ไม่มี tool ของ Buzzebees รองรับ ต้องประเมินแรงงานแยก</li>}
                {sol.api > 0 && <li>ลูกค้าขอ API {sol.api} ข้อ ต้องถาม Tech ว่ายอมให้หรือไม่</li>}
                {sol.untagged > 0 && <li>{sol.untagged} ข้อยังไม่ได้จัด solution (ผลเก่า) รันประเมินใหม่เพื่อให้รวมในสรุปนี้</li>}
              </ul>
            )}
          </section>
        )}

        <p className="m-0 border-t border-line pt-6 text-sm text-muted">
          ผลนี้ AI สร้างจาก Knowledge Base · PM ยืนยันแล้ว {confirmed} จาก {a.total} ข้อ ตรวจผลก่อนส่งต่อ
        </p>
      </div>

      <section aria-labelledby="questions-h" className="flex flex-col gap-4 border-t border-line pt-6"><QuestionsPanel /></section>
      {open && <ReqDrawer id={open} ids={order} onOpen={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

export default function Summary() {
  const a = useAssessment()
  return a ? <SummaryContent a={a} /> : <EmptyState title="Executive summary" lead="สรุปสำหรับผู้บริหารจากผลประเมินล่าสุด ดาวน์โหลดเป็น PDF ได้" />
}

