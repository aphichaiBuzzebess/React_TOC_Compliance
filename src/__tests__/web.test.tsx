import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { EMPTY_DRAFT, EMPTY_PROJECT, useAssessmentStore } from '@/store/useAssessmentStore'
import type { Req } from '@/lib/types'
import { pageSlices } from '@/lib/exportPdf'
import { Logo, logoPath, spreadFor } from '@/components/Logo'
import Splash from '@/components/Splash'
import { DEFAULT_TAXONOMY } from '@/data/taxonomy'

const { exportPdfMock } = vi.hoisted(() => ({ exportPdfMock: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/exportPdf', async (orig) => ({ ...(await orig<typeof import('@/lib/exportPdf')>()), exportPdf: exportPdfMock }))

const req = (id: string, s: Req['s']): Req => ({ id, module: 'Member', s, conf: '90%', text: `requirement ${id}`, reason: 'r', evidence: 'e', rec: 'c' })

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useAssessmentStore.setState({ result: null, review: null, coverage: null, selId: null, valid: {}, apiKey: '', accessCode: '', project: EMPTY_PROJECT, draft: EMPTY_DRAFT, scope: '', terms: [], confirmed: null })
})

describe('no mock data', () => {
  it.each(['/dashboard', '/matrix', '/gaps', '/questions', '/summary'])('%s shows an empty state until a TOR is assessed', (path) => {
    open(path)
    expect(screen.getByText(/ยังไม่มีผลประเมิน/)).toBeInTheDocument()
    expect(screen.queryByText('ยังไม่มี TOR')).not.toBeInTheDocument() // the old per-page status strip is gone
  })

  it('shows real results once there are some', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'none')], selId: 'R-001' })
    open('/matrix')
    expect(screen.getByText('requirement R-002')).toBeInTheDocument()
    expect(screen.queryByText('2 requirements')).not.toBeInTheDocument() // no status strip on result pages either
    expect(screen.queryByText('Customer TOR')).not.toBeInTheDocument()
  })
})

describe('AI settings', () => {
  it('never writes the API key or access code to browser storage', () => {
    useAssessmentStore.getState().setProvider('gemini')
    useAssessmentStore.getState().setApiKey('my-secret-key-123456')
    useAssessmentStore.getState().setAccessCode('code-123')
    useAssessmentStore.getState().select('R-001') // any persisted change triggers a save
    const saved = localStorage.getItem('tor-scouter') ?? ''
    expect(saved).toContain('gemini') // provider and model are remembered
    expect(saved).not.toContain('my-secret-key')
    expect(saved).not.toContain('code-123')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('my-secret-key')
  })

  it('switching provider resets to that provider\'s default model', () => {
    useAssessmentStore.getState().setProvider('gemini')
    expect(useAssessmentStore.getState().model).toBe('gemini-3.8-flash')
    useAssessmentStore.getState().setProvider('anthropic')
    expect(useAssessmentStore.getState().model).toBe('claude-sonnet-5-5')
  })

  it('cannot run an assessment without a key', async () => {
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.pdf')], apiKey: '' })
    await useAssessmentStore.getState().runReal()
    expect(useAssessmentStore.getState().running).toBe(false)
  })
})

describe('validation store', () => {
  it('records PM validation for the selected requirement', () => {
    useAssessmentStore.getState().select('R-001')
    useAssessmentStore.getState().validate('ok')
    expect(useAssessmentStore.getState().valid['R-001']).toBe('ok')
  })
})

describe('export', () => {
  const rows = [req('R-001', 'full'), req('R-002', 'none')]
  it('builds matrix, open-question and summary sheets', async () => {
    const { buildSheets } = await import('@/lib/exportXlsx')
    const { fromReqs } = await import('@/lib/assessment')
    const sheets = buildSheets(fromReqs(rows), [{ function: 'Point', coverage: 'partial', reqIds: ['R-001'], open: ['q1', 'q2'] }], { 'R-001': 'ok' })
    expect(sheets.map((s) => s.sheet)).toEqual(['Compliance matrix', 'Open questions', 'Summary'])
    expect(sheets[0].data).toHaveLength(3) // header + 2 requirements
    expect(sheets[1].data).toHaveLength(3) // header + 2 open questions
    expect((sheets[0].data[1][11] as { value: string }).value).toBe('Confirmed by PM')
    expect(buildSheets(fromReqs(rows), null, {}).map((s) => s.sheet)).toEqual(['Compliance matrix', 'Summary'])
  })

  it('writes a real .xlsx file', async () => {
    const writeXlsxFile = (await import('write-excel-file/browser')).default
    const { buildSheets } = await import('@/lib/exportXlsx')
    const { fromReqs } = await import('@/lib/assessment')
    const blob = await writeXlsxFile(buildSheets(fromReqs(rows), null, {})).toBlob()
    expect(blob.size).toBeGreaterThan(1000)
  })
})

describe('run progress', () => {
  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
  const reqs = Array.from({ length: 12 }, (_, i) => ({ id: `R-${i + 1}`, module: 'Member', text: `t${i}` }))
  const run = async (questionsOk: boolean) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/extract') return ok({ requirements: reqs })
      if (url === '/api/classify') return ok({ results: (JSON.parse(init.body as string).requirements as typeof reqs).map((r) => ({ ...r, targets: [{ solution: 'app-custom', service: 'user-management' }], wantsApi: false })) })
      if (url === '/api/judge') return ok({ results: (JSON.parse(init.body as string).requirements as typeof reqs).map((r) => req(r.id, 'full')) })
      return questionsOk ? ok({ topics: [{ function: 'Point', coverage: 'covered', reqIds: [], open: [] }] }) : ({ ok: false, status: 500, json: async () => ({ error: 'quota exceeded' }) } as Response)
    }))
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.pdf')], apiKey: 'k-123456789', running: false, step: -1, error: null })
    await useAssessmentStore.getState().runReal()
    await useAssessmentStore.getState().confirmReview()
    return useAssessmentStore.getState()
  }

  it('stops after classify so the BA can confirm solutions, and judges nothing yet', async () => {
    const judged = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/extract') return ok({ requirements: reqs })
      if (url === '/api/classify') return ok({ results: (JSON.parse(init.body as string).requirements as typeof reqs).map((r) => ({ ...r, targets: [{ solution: 'crm-plus', service: 'campaign-management' }], wantsApi: r.id === 'R-001' })) })
      judged(url)
      return ok({ results: [], topics: [] })
    }))
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.pdf')], apiKey: 'k-123456789', running: false, step: -1, error: null })
    await useAssessmentStore.getState().runReal()
    const s = useAssessmentStore.getState()
    expect(s.review).toHaveLength(12)
    expect(s.review?.[0]).toMatchObject({ targets: [{ solution: 'crm-plus', service: 'campaign-management' }], wantsApi: true })
    expect(s.result).toBeNull()
    expect(s.running).toBe(false)
    expect(s.step).toBe(2)
    expect(judged).not.toHaveBeenCalled()
  })

  it('sends the edited solutions and the API flag to the judge, then clears the review', async () => {
    const sent: { id: string; targets?: unknown; wantsApi?: boolean }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/judge') { const rs = JSON.parse(init.body as string).requirements as typeof sent; sent.push(...rs); return ok({ results: rs.map((r) => req(r.id, 'full')) }) }
      return ok({ topics: [] })
    }))
    useAssessmentStore.setState({ apiKey: 'k-123456789', review: [{ id: 'R-1', module: 'M', text: 't', targets: [{ solution: 'unknown', service: 'unknown' }] }], result: null })
    useAssessmentStore.getState().setTargets('R-1', [{ solution: 'app-custom', service: 'point' }, { solution: 'crm-plus', service: 'report-analytic' }])
    useAssessmentStore.getState().setWantsApi('R-1', true)
    await useAssessmentStore.getState().confirmReview()
    expect(sent[0]).toMatchObject({ id: 'R-1', wantsApi: true, targets: [{ solution: 'app-custom', service: 'point' }, { solution: 'crm-plus', service: 'report-analytic' }] })
    expect(useAssessmentStore.getState().review).toBeNull()
    expect(useAssessmentStore.getState().result).toHaveLength(1)
  })

  it('keeps the review when judging fails, so confirming again retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) as Response))
    useAssessmentStore.setState({ apiKey: 'k-123456789', review: [{ id: 'R-1', module: 'M', text: 't' }], result: null })
    await useAssessmentStore.getState().confirmReview()
    expect(useAssessmentStore.getState().review).toHaveLength(1)
    expect(useAssessmentStore.getState().error).toContain('boom')
  })

  it('finishes with results and clears the progress text', async () => {
    const s = await run(true)
    expect(s.result).toHaveLength(12)
    expect(s.step).toBe(5)
    expect(s.running).toBe(false)
    expect(s.detail).toBe('')
    expect(s.startedAt).toBeNull()
    expect(s.error).toBeNull()
  })

  it('keeps the results when only the open-question check fails', async () => {
    const s = await run(false)
    expect(s.result).toHaveLength(12)
    expect(s.coverage).toBeNull()
    expect(s.error).toContain('quota exceeded')
  })
})

describe('progress display', () => {
  it('shows what the run is doing and the elapsed time while running', () => {
    useAssessmentStore.setState({ running: true, step: 2, startedAt: Date.now() - 12_000, detail: 'พบ 26 requirement ประเมินแล้ว 1/3 ชุด' })
    open('/')
    expect(screen.getAllByText('พบ 26 requirement ประเมินแล้ว 1/3 ชุด').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1[23]s/).length).toBeGreaterThan(0) // page card and header chip
    expect(screen.getByText(/กำลังประเมิน/)).toBeInTheDocument()
    useAssessmentStore.setState({ running: false, startedAt: null, detail: '', step: -1 })
  })
})

describe('summary pdf', () => {
  it('downloads a PDF file instead of opening the print dialog', async () => {
    exportPdfMock.mockClear()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    useAssessmentStore.setState({ result: [req('R-001', 'full')], customer: 'Bangchak' })
    open('/summary')
    screen.getByRole('button', { name: 'Download PDF' }).click()
    await vi.waitFor(() => expect(exportPdfMock).toHaveBeenCalled())
    expect(exportPdfMock.mock.calls[0][0]).toBeInstanceOf(HTMLElement)
    expect(exportPdfMock.mock.calls[0][1]).toMatch(/^Bangchak_executive_summary_\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(print).not.toHaveBeenCalled()
    print.mockRestore()
  })

  it('names the PDF for the project title when there is one', async () => {
    exportPdfMock.mockClear()
    useAssessmentStore.setState({ result: [req('R-001', 'full')], customer: 'Bangchak', project: { ...EMPTY_PROJECT, title: 'Loyalty App 2027' } })
    open('/summary')
    screen.getByRole('button', { name: 'Download PDF' }).click()
    await vi.waitFor(() => expect(exportPdfMock).toHaveBeenCalled())
    expect(exportPdfMock.mock.calls[0][1]).toMatch(/^Loyalty_App_2027_executive_summary_\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(screen.getByText(/TOR Scouter · Loyalty App 2027 · Bangchak ·/)).toBeInTheDocument()
    useAssessmentStore.setState({ project: EMPTY_PROJECT })
  })

  it('splits a tall page into A4-sized slices', () => {
    expect(pageSlices(2500, 1000)).toEqual([{ y: 0, h: 1000 }, { y: 1000, h: 1000 }, { y: 2000, h: 500 }])
    expect(pageSlices(800, 1000)).toEqual([{ y: 0, h: 800 }])
  })
})

describe('animated logo', () => {
  const rest = readFileSync(join(process.cwd(), 'public/favicon.svg'), 'utf8').match(/ d="([^"]+)"/)![1]
  const pathOf = (c: HTMLElement) => c.querySelector('path')!.getAttribute('d')

  it('at rest it is exactly the logo file, so the code and the brand files cannot drift apart', () => {
    expect(logoPath(1)).toBe(rest)
  })

  it('progress moves the cells: none = apart, done = the logo at rest', () => {
    expect(spreadFor(1)).toBe(1)
    expect(spreadFor(0)).toBeGreaterThan(2)
    const done = render(<Logo progress={1} />)
    expect(pathOf(done.container)).toBe(rest)
    const none = render(<Logo progress={0} />)
    expect(pathOf(none.container)).not.toBe(rest)
    expect(pathOf(none.container)).toBe(logoPath(spreadFor(0)))
  })

  it('parting on hover and closing again: it ends exactly at rest and never crosses past it by much', async () => {
    const { container, rerender } = render(<Logo active />)
    expect(pathOf(container)).toBe(logoPath(1.3))
    const xs: number[] = []
    const sample = () => xs.push(+pathOf(container)!.split(' ')[0].slice(1))
    rerender(<Logo active={false} />)
    const timer = setInterval(sample, 20)
    await waitFor(() => expect(pathOf(container)).toBe(rest), { timeout: 4000 })
    clearInterval(timer)
    const restX = +rest.split(' ')[0].slice(1)
    // the first vertex starts left of rest (cells apart) and may overshoot a hair past it, but not far
    expect(Math.max(...xs)).toBeLessThan(restX + 3)
  })

  it('is decorative: hidden from screen readers', () => {
    const { container } = render(<Logo />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('the header logo is in the page and the app still renders with it', () => {
    open('/')
    expect(screen.getByRole('link', { name: /TOR Scouter/ }).querySelector('svg path')).not.toBeNull()
  })
})

describe('dark mode', () => {
  it('the header button switches the theme, announces it, and the choice is remembered', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ theme: 'system' })
    open('/')
    const btn = screen.getByRole('button', { name: 'โหมดมืด' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await user.click(btn)
    expect(useAssessmentStore.getState().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'โหมดมืด' })).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem('tor-scouter') ?? '{}').state.theme).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'โหมดมืด' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('has no colours hardcoded in the pages: every colour comes from the palette', () => {
    const files = ['src/components/ui.tsx', 'src/components/AppShell.tsx', 'src/components/tor.tsx', 'src/components/ResultHead.tsx', 'src/pages/Matrix.tsx', 'src/pages/Questions.tsx', 'src/pages/Summary.tsx', 'src/pages/Review.tsx', 'src/pages/History.tsx', 'src/pages/KnowledgeBase.tsx', 'src/pages/AiSettings.tsx']
    for (const f of files) {
      const text = readFileSync(join(process.cwd(), f), 'utf8')
      expect(text, f).not.toMatch(/bg-white|text-\[#|bg-\[#|border-\[#/)
    }
  })
})

describe('retry open questions', () => {
  it('re-checks coverage from the saved results without re-running the assessment', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return { ok: true, json: async () => ({ topics: [{ function: 'Point', coverage: 'missing', reqIds: [], open: ['q'] }] }) } as Response
    }))
    useAssessmentStore.setState({ result: [req('R-001', 'full')], coverage: null, apiKey: 'k-123456789', error: 'old failure' })
    await useAssessmentStore.getState().runCoverage()
    const s = useAssessmentStore.getState()
    expect(calls).toEqual(['/api/questions', '/api/questions', '/api/questions', '/api/questions']) // the check is split in 4 short calls
    expect(s.coverage).toHaveLength(4) // each fake call returns one topic; they are joined
    expect(s.result).toHaveLength(1)
    expect(s.error).toBeNull()
    expect(s.coverageBusy).toBe(false)
  })

  it('keeps the results and shows the error when the retry fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'quota exceeded' }) }) as Response))
    useAssessmentStore.setState({ result: [req('R-001', 'full')], coverage: null, apiKey: 'k-123456789' })
    await useAssessmentStore.getState().runCoverage()
    expect(useAssessmentStore.getState().error).toBe('quota exceeded')
    expect(useAssessmentStore.getState().result).toHaveLength(1)
  })
})

describe('accessibility fixes', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

  // The palette lives in index.css: a light set and a dark set. Read both from there, so the test cannot drift from the real colours.
  const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')
  const block = (open: string) => css.slice(css.indexOf(open), css.indexOf('\n  }', css.indexOf(open)) > 0 && open.startsWith(':root[') ? css.indexOf('\n  }', css.indexOf(open)) : css.indexOf('\n}', css.indexOf(open)))
  const vars = (text: string) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
  const themes = { light: vars(block(':root,\n.force-light')), dark: { ...vars(block(':root,\n.force-light')), ...vars(block(":root[data-theme='dark']")) } }

  it.each(['light', 'dark'] as const)('%s: every status badge has at least 4.5:1 text contrast', (t) => {
    const v = themes[t]
    for (const k of ['full', 'config', 'custom', 'integ', 'none', 'verify']) expect(ratio(v[`st-${k}-fg`], v[`st-${k}-bg`]), `${k} ${v[`st-${k}-fg`]} on ${v[`st-${k}-bg`]}`).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['light', 'dark'] as const)('%s: body, muted, link, error and success text read on every surface they sit on', (t) => {
    const v = themes[t]
    for (const bg of ['c-canvas', 'c-surface', 'c-tint']) {
      for (const fg of ['c-ink', 'c-muted', 'c-amber-text', 'c-danger', 'c-success']) expect(ratio(v[fg], v[bg]), `${t}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(ratio(v['c-amber-text'], v['c-amber-soft']), `${t}: amber-text on amber-soft`).toBeGreaterThanOrEqual(4.5)
    expect(ratio(v['c-on-amber'], '#f9a601'), 'text on the amber fill').toBeGreaterThanOrEqual(4.5)
    expect(ratio(v['c-inverse'], v['c-ink']), `${t}: text on an ink fill`).toBeGreaterThanOrEqual(4.5)
  })

  it.each([
    ['/summary', /Executive summary/],
    ['/matrix', /Compliance matrix/],
    ['/knowledge-base', /Knowledge base/],
  ])('%s sets its own tab title', (path, title) => {
    open(path)
    expect(document.title).toMatch(title)
    expect(document.title).toContain('TOR Scouter')
  })

  it('offers a skip link to the main region', () => {
    open('/dashboard')
    const skip = screen.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' })
    expect(skip).toHaveAttribute('href', '#main')
    expect(document.getElementById('main')).toBeInTheDocument()
  })

  it('keeps the ticking timer out of the live region', () => {
    useAssessmentStore.setState({ running: true, step: 2, startedAt: Date.now() - 12_000, detail: 'ประเมินแล้ว 1/3 ชุด' })
    open('/')
    const live = screen.getByText('ประเมินแล้ว 1/3 ชุด')
    expect(live).toHaveAttribute('role', 'status')
    expect(live.textContent).not.toMatch(/\d+s/)
    useAssessmentStore.setState({ running: false, startedAt: null, detail: '', step: -1 })
  })

  it('says why Run is disabled', () => {
    useAssessmentStore.setState({ files: [], apiKey: '' })
    open('/')
    const hint = screen.getByText('เพิ่มไฟล์ TOR และตั้งค่า AI ก่อน')
    expect(screen.getByRole('button', { name: 'แยก Requirement' })).toHaveAttribute('aria-describedby', hint.id)
  })

  it('the per-requirement list is a labelled table with its column headers', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'none')] })
    open('/matrix')
    const table = screen.getByRole('table', { name: 'Requirement รายข้อ' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['ข้อ', 'Requirement', 'ระดับ', 'ผล', 'Feature ของเรา'])
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })
})

describe('compliance matrix review flow', () => {
  const mk = (id: string, module: string, s: Req['s'], text: string): Req => ({ id, module, s, conf: '80%', text, reason: `reason for ${id}`, evidence: `evidence for ${id}`, rec: `rec for ${id}` })
  const data = [
    mk('R-001', 'Member', 'full', 'สมัครสมาชิกผ่าน LINE'),
    mk('R-002', 'Member', 'custom', 'รวมบัญชีสมาชิก'),
    mk('R-003', 'Point', 'integ', 'ส่งคะแนนเข้า SAP'),
    mk('R-004', 'Point', 'verify', 'โอนคะแนนข้าม Brand'),
  ]
  const drawer = () => within(screen.getByRole('dialog'))
  const row = (id: string) => screen.getByRole('button', { name: new RegExp(`^${id} `) })

  beforeEach(() => {
    useAssessmentStore.setState({ result: data, selId: null, filter: 'all', query: '', valid: {} })
  })

  it('opens the requirement you picked in a drawer, with its reasoning, evidence and advice', async () => {
    const user = userEvent.setup()
    open('/matrix')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByText('ส่งคะแนนเข้า SAP')) // anywhere on the row
    expect(screen.getByRole('dialog', { name: 'ส่งคะแนนเข้า SAP' })).toBeInTheDocument()
    expect(drawer().getByText('reason for R-003')).toBeInTheDocument()
    expect(drawer().getByText('evidence for R-003')).toBeInTheDocument()
    expect(drawer().getByText('rec for R-003')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('steps with next/previous inside the filtered rows and shows the position', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.selectOptions(screen.getByLabelText('หมวด'), 'Point')
    await user.click(row('R-003'))
    expect(drawer().getByText('1 / 2')).toBeInTheDocument()
    expect(drawer().getByRole('button', { name: 'ข้อก่อนหน้า' })).toBeDisabled()
    await user.click(drawer().getByRole('button', { name: 'ข้อถัดไป' }))
    expect(drawer().getByText('reason for R-004')).toBeInTheDocument()
    expect(drawer().getByText('2 / 2')).toBeInTheDocument()
    expect(drawer().getByRole('button', { name: 'ข้อถัดไป' })).toBeDisabled()
  })

  it('filters by category and result group, mandatory only, and clears the filters', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ result: [...data.slice(0, 3), { ...data[3], pri: 'O' }] })
    open('/matrix')
    await user.selectOptions(screen.getByLabelText('หมวด'), 'Member')
    expect(screen.queryByRole('button', { name: /^R-003 / })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^มีงานเพิ่ม/ }))
    expect(row('R-002')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^R-001 / })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'ล้างตัวกรอง' })[0])
    expect(row('R-004')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'เฉพาะข้อบังคับ' }))
    expect(screen.queryByRole('button', { name: /^R-004 / })).not.toBeInTheDocument()
  })

  it('confirming records the result and moves on to the next requirement', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.click(row('R-001'))
    await user.click(drawer().getByRole('button', { name: /ยืนยันผล/ }))
    expect(useAssessmentStore.getState().valid['R-001']).toBe('ok')
    expect(drawer().getByText('reason for R-002')).toBeInTheDocument()
    await user.click(drawer().getByRole('button', { name: 'ติดธง' }))
    expect(useAssessmentStore.getState().valid['R-002']).toBe('flag')
    expect(screen.getByText(/ยืนยันแล้ว 1 · ติดธง 1 · ยังไม่ตรวจ 2/)).toBeInTheDocument()
  })

  it('a person can change the status, with a reason; the AI status is kept and shown', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.click(row('R-004'))
    await user.selectOptions(drawer().getByLabelText('ผลใหม่'), 'none')
    await user.type(drawer().getByLabelText('เหตุผลที่เปลี่ยน'), 'Product ยืนยันว่าไม่มี')
    await user.click(drawer().getByRole('button', { name: 'บันทึกผล' }))
    expect(useAssessmentStore.getState().result?.find((r) => r.id === 'R-004')).toMatchObject({ s: 'none', override: { from: 'verify', note: 'Product ยืนยันว่าไม่มี' } })
    expect(drawer().getByText('แก้โดย BD จากเดิม ต้องตรวจสอบ: Product ยืนยันว่าไม่มี')).toBeInTheDocument()
    expect(screen.getByText('แก้โดย BD')).toBeInTheDocument() // the row says so too
    // back to what the AI said: the override goes
    await user.selectOptions(drawer().getByLabelText('ผลใหม่'), 'verify')
    await user.click(drawer().getByRole('button', { name: 'บันทึกผล' }))
    expect(useAssessmentStore.getState().result?.find((r) => r.id === 'R-004')?.override).toBeUndefined()
  })

  it('moves between rows with the arrow keys', async () => {
    const user = userEvent.setup()
    open('/matrix')
    row('R-001').focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(row('R-003'))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(row('R-002'))
  })

  it('keeps long unbroken text (URLs) from stretching the table', () => {
    useAssessmentStore.setState({ result: [mk('R-001', 'Member', 'full', 'ดูที่ https://www.example.com/th/member/history')] })
    open('/matrix')
    for (const el of screen.getAllByText(/https:\/\/www\.example\.com/)) expect(el.className).toContain('wrap-anywhere')
  })
})

describe('home: upload form', () => {
  const runBtn = () => screen.getByRole('button', { name: 'แยก Requirement' })

  beforeEach(() => {
    useAssessmentStore.setState({ result: null, coverage: null, files: [], customer: '', project: EMPTY_PROJECT, apiKey: '', running: false, step: -1, error: null, detail: '', startedAt: null })
  })

  it('says what is missing before the run, and is ready once a key and a file are in', () => {
    const { unmount } = open('/')
    expect(runBtn()).toBeDisabled()
    expect(screen.getByText('เพิ่มไฟล์ TOR และตั้งค่า AI ก่อน')).toBeInTheDocument()
    expect(screen.getByText('ยังไม่ได้ตั้งค่า')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ตั้งค่า AI' })).toHaveAttribute('href', '/ai-settings')
    unmount()
    useAssessmentStore.setState({ apiKey: 'k-123456789', files: [new File(['x'], 'bangchak-tor.pdf')] })
    open('/')
    expect(screen.getByText('bangchak-tor.pdf')).toBeInTheDocument()
    expect(screen.getByText('พร้อมแล้ว')).toBeInTheDocument()
    expect(runBtn()).toBeEnabled()
  })

  it('takes files from a drop zone that accepts several files, including CSV and TXT', () => {
    open('/')
    const input = document.getElementById('torFile') as HTMLInputElement
    expect(input.multiple).toBe(true)
    for (const ext of ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.png']) expect(input.accept).toContain(ext)
    expect(input.closest('label')).toHaveTextContent('ลาก TOR มาวางตรงนี้')
    const drop = new Event('drop', { bubbles: true }) as Event & { dataTransfer: unknown }
    drop.dataTransfer = { files: [new File(['a'], 'annex.csv')] }
    act(() => { input.closest('label')!.dispatchEvent(drop) })
    expect(useAssessmentStore.getState().files.map((f) => f.name)).toEqual(['annex.csv'])
  })

  it('attaches several files, including images, lets you remove one, and skips duplicates', async () => {
    const user = userEvent.setup()
    open('/')
    const input = document.getElementById('torFile') as HTMLInputElement
    const pdf = new File(['x'], 'tor.pdf', { type: 'application/pdf', lastModified: 1 })
    const shot = new File(['y'], 'table.png', { type: 'image/png', lastModified: 1 })
    await user.upload(input, [pdf, shot])
    const list = screen.getByRole('list', { name: 'ไฟล์ที่เลือก' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    await user.upload(input, pdf) // same file again
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'เอา tor.pdf ออก' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('table.png')).toBeInTheDocument()
  })

  it('refuses a file over 4 MB and says which one', () => {
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'huge.pdf')
    useAssessmentStore.getState().addFiles([big])
    expect(useAssessmentStore.getState().files).toHaveLength(0)
    expect(useAssessmentStore.getState().error).toContain('huge.pdf')
  })

  it('loads the sample TOR and fills an empty project name and customer', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/samples/tor-sample.txt' ? ({ ok: true, blob: async () => new Blob(['ระบบต้องมี OTP']) } as Response) : ({ ok: false, status: 404, json: async () => ({}) } as Response))))
    open('/')
    await user.click(screen.getByRole('button', { name: 'ใช้ไฟล์ตัวอย่าง' }))
    await waitFor(() => expect(useAssessmentStore.getState().files).toHaveLength(1))
    expect(useAssessmentStore.getState().files[0].name).toMatch(/\.txt$/)
    expect(screen.getByLabelText('ชื่อโครงการ')).toHaveValue('TOR ระบบสมาชิกเครือร้านอาหาร')
    expect(screen.getByLabelText('ลูกค้า')).toHaveValue('บจก. ตัวอย่าง ฟู้ดส์')
    expect(screen.queryByRole('button', { name: 'ใช้ไฟล์ตัวอย่าง' })).not.toBeInTheDocument() // the offer goes once there are files
    vi.unstubAllGlobals()
  })

  it('records the project details, with industry levels that open one after another', async () => {
    const user = userEvent.setup()
    open('/')
    await user.type(screen.getByLabelText('ชื่อโครงการ'), 'TOR CRM')
    await user.type(screen.getByLabelText('ลูกค้า'), 'ACME')
    expect(screen.getByLabelText('Sub-Industry')).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Industry'), 'Retail Business')
    await user.selectOptions(screen.getByLabelText('Sub-Industry'), 'Department Store')
    await user.selectOptions(screen.getByLabelText('Sub-Sub-Industry'), 'Department Store')
    fireEvent.change(screen.getByLabelText('กำหนดยื่นข้อเสนอ'), { target: { value: '2026-12-15' } })
    await user.type(screen.getByLabelText(/มูลค่าโครงการ/), '1500000')
    expect(screen.getByLabelText(/มูลค่าโครงการ/)).toHaveValue('1,500,000')
    expect(useAssessmentStore.getState().draft.project).toEqual({ title: 'TOR CRM', industry: 'Retail Business', sub: 'Department Store', leaf: 'Department Store', due: '2026-12-15', value: 1500000 })
    expect(useAssessmentStore.getState().draft.customer).toBe('ACME')
    expect(useAssessmentStore.getState().project).toEqual(EMPTY_PROJECT) // the form is a draft: the TOR on screen is untouched
    await user.selectOptions(screen.getByLabelText('Industry'), 'Hospital') // another industry clears the levels under it
    expect(useAssessmentStore.getState().draft.project).toMatchObject({ industry: 'Hospital', sub: '', leaf: '' })
    expect(screen.getByLabelText('Sub-Sub-Industry')).toBeDisabled()
  })

  it('reads each file with its own request and renumbers the requirements across all of them', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response
      if (url === '/api/extract') {
        const name = decodeURIComponent((init.headers as Record<string, string>)['x-filename'])
        seen.push(name)
        return ok({ requirements: [{ id: 'R-001', module: 'Member', text: `from ${name}` }] })
      }
      if (url === '/api/classify') return ok({ results: (JSON.parse(init.body as string).requirements as { id: string; module: string; text: string }[]) })
      if (url === '/api/judge') return ok({ results: (JSON.parse(init.body as string).requirements as { id: string; module: string; text: string }[]).map((r) => req(r.id, 'full')) })
      return ok({ topics: [] })
    }))
    useAssessmentStore.setState({ files: [new File(['a'], 'a.pdf'), new File(['b'], 'b.png')], apiKey: 'k-123456789' })
    await useAssessmentStore.getState().runReal()
    await useAssessmentStore.getState().confirmReview()
    expect(seen.sort()).toEqual(['a.pdf', 'b.png'])
    expect(useAssessmentStore.getState().result?.map((r) => r.id)).toEqual(['R-001', 'R-002'])
    vi.unstubAllGlobals()
  })

  it('is ready to run without a key when the server offers a default AI, and sends no AI headers', async () => {
    let headers: Record<string, string> = {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response
      if (url === '/api/extract') { headers = init.headers as Record<string, string>; return ok({ requirements: [{ id: 'R-001', module: 'Member', text: 't' }] }) }
      if (url === '/api/classify') return ok({ results: [{ id: 'R-001', module: 'Member', text: 't' }] })
      if (url === '/api/judge') return ok({ results: [req('R-001', 'full')] })
      return ok({ topics: [] })
    }))
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.pdf')], serverDefault: { provider: 'gemini', model: 'gemini-3.8-flash' } })
    open('/')
    expect(runBtn()).toBeEnabled()
    expect(screen.getByText(/ค่าจากเซิร์ฟเวอร์/)).toBeInTheDocument()
    await useAssessmentStore.getState().runReal()
    useAssessmentStore.setState({ serverDefault: { provider: 'gemini', model: 'gemini-3.8-flash' } }) // the mounted app's status probe got {} from this fake fetch and cleared it
    await useAssessmentStore.getState().confirmReview()
    expect(Object.keys(headers).filter((h) => h.startsWith('x-llm'))).toEqual([])
    expect(useAssessmentStore.getState().result).toHaveLength(1)
    useAssessmentStore.setState({ serverDefault: null })
    vi.unstubAllGlobals()
  })

  it('shows progress while running, with the step and the live detail', () => {
    useAssessmentStore.setState({ running: true, step: 1, startedAt: Date.now(), detail: 'พบ 12 requirement', files: [new File(['x'], 'tor.pdf')], apiKey: 'k-123456789' })
    open('/')
    expect(screen.getByText(/ขั้น 2\/5/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('พบ 12 requirement')
    expect(screen.getByRole('button', { name: 'กำลังแยก Requirement…' })).toBeDisabled()
    expect(document.getElementById('torFile')).toBeDisabled()
    useAssessmentStore.setState({ running: false, startedAt: null, detail: '', step: -1 })
  })

  it('shows the last result with shortcuts when there are no accounts, and hides it while running', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'verify'), req('R-002', 'integ')], project: { ...EMPTY_PROJECT, title: 'TOR CRM' } })
    const { unmount } = open('/')
    const recent = within(screen.getByRole('region', { name: 'TOR ล่าสุด' }))
    expect(recent.getByRole('button', { name: 'เปิด TOR CRM' })).toBeInTheDocument() // the same row as the TOR list
    expect(recent.getByRole('table', { name: 'TOR ล่าสุด' })).toHaveTextContent('ยื่นได้') // with the verdict
    expect(recent.queryByRole('link', { name: /ดูทั้งหมด/ })).not.toBeInTheDocument() // no list to see without accounts
    unmount()
    useAssessmentStore.setState({ running: true })
    open('/')
    expect(screen.queryByRole('region', { name: 'TOR ล่าสุด' })).not.toBeInTheDocument()
    useAssessmentStore.setState({ running: false })
  })

  it('with accounts, shows the newest three as TOR list rows and a way to the rest', async () => {
    const e = (n: number) => ({ id: `h-${n}`, customer: `C${n}`, title: `TOR ${n}`, files: [], counts: { full: 2, none: 1 }, createdAt: '2026-11-20T10:00:00.000Z' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url === '/api/history' ? { entries: [1, 2, 3, 4].map(e) } : url === '/api/auth' ? { mode: 'account', user: { username: 'ann' } } : {}) }) as Response))
    useAssessmentStore.setState({ mode: 'account', user: 'ann', owner: 'ann' })
    open('/')
    const recent = within(await screen.findByRole('region', { name: 'TOR ล่าสุด' }))
    expect(recent.getAllByRole('button', { name: /^เปิด TOR / })).toHaveLength(3)
    expect(recent.getByRole('link', { name: 'ดูทั้งหมด 4' })).toHaveAttribute('href', '/history')
    expect(recent.getByRole('table', { name: 'TOR ล่าสุด' })).toHaveTextContent('67%')
    vi.unstubAllGlobals()
    useAssessmentStore.setState({ mode: 'unknown', user: null, owner: null })
  })

  it('has no recent list before the first assessment', () => {
    open('/')
    expect(screen.queryByRole('region', { name: 'TOR ล่าสุด' })).not.toBeInTheDocument()
  })

  it('shows a failure next to the button', () => {
    useAssessmentStore.setState({ error: 'API key not valid. Please pass a valid API key.' })
    open('/')
    expect(screen.getByRole('alert')).toHaveTextContent('API key not valid')
  })

  it('once the requirements are split, the form is empty for the next TOR, and the TOR keeps its details; a failed run keeps the form', async () => {
    const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response
    const filled = { customer: 'ACME', project: { ...EMPTY_PROJECT, title: 'TOR CRM' } }
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'quota exceeded' }) }) as Response))
    useAssessmentStore.setState({ draft: filled, files: [new File(['x'], 'tor.txt')], apiKey: 'k-123456789', running: false, step: -1 })
    await useAssessmentStore.getState().runReal()
    expect(useAssessmentStore.getState()).toMatchObject({ draft: filled, error: 'quota exceeded' }) // try again without typing it all again
    expect(useAssessmentStore.getState().files).toHaveLength(1)
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/extract') return ok({ requirements: [{ id: 'R-001', module: 'Mission', text: 't' }] })
      return ok({ results: JSON.parse(init.body as string).requirements })
    }))
    await useAssessmentStore.getState().runReal()
    expect(useAssessmentStore.getState()).toMatchObject({ draft: EMPTY_DRAFT, files: [], customer: 'ACME', project: { title: 'TOR CRM' } })
    open('/')
    expect(screen.getByLabelText('ชื่อโครงการ')).toHaveValue('')
    expect(screen.getByLabelText('ลูกค้า')).toHaveValue('')
    vi.unstubAllGlobals()
  })

  it('heads the result with the project name, its details, what it asks for and who confirmed the list', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full')], customer: 'ACME', scope: 'ระบบสมาชิกสำหรับห้าง', confirmed: { by: 'ann', at: '2026-11-20T09:05:00.000Z' }, project: { title: 'TOR CRM', industry: 'Retail Business', sub: 'Department Store', leaf: 'Department Store', due: '2026-12-15', value: 1800000 } })
    open('/summary')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TOR CRM')
    for (const fact of ['ACME', 'Retail Business › Department Store', 'มูลค่า 1,800,000 บาท', '1 ข้อ']) expect(screen.getByText(fact)).toBeInTheDocument() // a repeated level is shown once
    expect(screen.getByText(/^ยื่น /)).toBeInTheDocument()
    expect(screen.getByText(/^ยืนยัน requirement โดย ann /)).toBeInTheDocument()
    expect(screen.getByText('ระบบสมาชิกสำหรับห้าง')).toBeInTheDocument()
    useAssessmentStore.setState({ scope: '', confirmed: null })
  })

  it('shows a disabled button as gray rather than a faded primary', () => {
    open('/')
    expect(runBtn().className).toContain('disabled:bg-tint')
  })
})

describe('solution and service in the matrix', () => {
  const mk = (id: string, s: Req['s'], extra: Partial<Req> = {}): Req => ({ id, module: 'Member', s, conf: '80%', text: `text ${id}`, reason: `reason ${id}`, evidence: `evidence ${id}`, rec: `rec ${id}`, ...extra })
  const data = [
    mk('R-001', 'full', { targets: [{ solution: 'app-custom', service: 'user-management' }] }),
    mk('R-002', 'verify', { targets: [{ solution: 'crm-plus', service: 'campaign-management' }], wantsApi: true }),
    mk('R-003', 'config', { targets: [{ solution: 'crm-plus', service: 'report-analytic' }] }),
  ]
  beforeEach(() => useAssessmentStore.setState({ result: data, selId: 'R-001', filter: 'all', query: '', valid: {} }))

  it('shows solution › service per requirement and the API tag', () => {
    open('/matrix')
    expect(screen.getAllByText('App project — Custom › User Management').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ขอ API · ถาม Tech').length).toBeGreaterThan(0)
  })

  it('filters by solution, by service and by the API tag, and clears them', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.selectOptions(screen.getByLabelText('Solution'), 'crm-plus')
    expect(screen.queryByRole('button', { name: /^R-001 / })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Service'), 'report-analytic')
    expect(screen.getByRole('button', { name: /^R-003 / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^R-002 / })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'ล้างตัวกรอง' })[0])
    await user.click(screen.getByRole('button', { name: /ขอ API · ถาม Tech · 1/ }))
    expect(screen.getByRole('button', { name: /^R-002 / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^R-001 / })).not.toBeInTheDocument()
  })

  it('still renders a result saved before solutions existed, without solution filters', () => {
    useAssessmentStore.setState({ result: [mk('R-001', 'full')] })
    open('/matrix')
    expect(screen.getByRole('button', { name: /^R-001 / })).toBeInTheDocument()
    expect(screen.queryByLabelText('Solution')).not.toBeInTheDocument()
  })

  it('exports Solution, Service and the API flag', async () => {
    const { buildSheets } = await import('@/lib/exportXlsx')
    const { fromReqs } = await import('@/lib/assessment')
    const rows = buildSheets(fromReqs(data), null, {})[0].data
    expect((rows[0] as { value: string }[]).slice(2, 5).map((c) => c.value)).toEqual(['Solution', 'Service', 'ขอ API'])
    expect((rows[2] as { value: string }[]).slice(2, 5).map((c) => c.value)).toEqual(['CRM+ module', 'Campaign Management', 'ขอ API · ถาม Tech'])
  })
})

describe('review solutions page', () => {
  const pending = [
    { id: 'R-001', module: 'Member', text: 'ทำแอป', targets: [{ solution: 'app-custom', service: 'unknown' }] },
    { id: 'R-002', module: 'Campaign', text: 'หลังบ้านจัดการ campaign เอง', targets: [{ solution: 'crm-plus', service: 'campaign-management' }] },
    { id: 'R-003', module: 'X', text: 'ไม่รู้ว่าอะไร', targets: [{ solution: 'unknown', service: 'unknown' }] },
  ]

  it('says there is nothing to review when no run is waiting', () => {
    open('/review')
    expect(screen.getByText('ยังไม่มี requirement รอตรวจ')).toBeInTheDocument()
  })

  it('opens with what the TOR asks for, its categories and its contract terms, then what needs a look first', () => {
    useAssessmentStore.setState({
      scope: 'ระบบสมาชิกผ่าน LINE',
      apiKey: 'k',
      review: [
        { id: 'R-001', module: 'Membership & Tier', text: 'สมัครผ่าน LINE', pri: 'M', targets: [{ solution: 'app-custom', service: 'user-management' }] },
        { id: 'R-002', module: 'Dashboard & Report', text: 'Real-time dashboard', pri: 'M', amb: 'ไม่ได้บอกว่าหน่วงได้กี่นาที', targets: [{ solution: 'crm-plus', service: 'report-analytic' }] },
        { id: 'R-003', module: 'System Point', text: 'คะแนนต่อยอดซื้อ', pri: 'O', inf: true, targets: [{ solution: 'crm-plus', service: 'point' }] },
        { id: 'R-004', module: 'เงื่อนไขสัญญาและผู้ยื่น', text: 'ส่งมอบใน 120 วัน', ref: 'ข้อ 6.2', pri: 'M' },
      ],
    })
    open('/review')
    expect(screen.getByText('ขั้นที่ 1 จาก 2 · ตรวจ requirement')).toBeInTheDocument()
    expect(screen.getByText('ระบบสมาชิกผ่าน LINE')).toBeInTheDocument()
    expect(screen.getByText('3 ข้อ ใน 3 หมวด · ข้อบังคับ 2')).toBeInTheDocument() // contract terms are not product requirements
    const brief = within(screen.getByRole('region', { name: 'สรุป TOR' }))
    expect(brief.getByRole('button', { name: /Dashboard & Report/ })).toBeInTheDocument()
    expect(brief.getByText('ส่งมอบใน 120 วัน')).toBeInTheDocument()
    const look = within(screen.getByRole('region', { name: 'ต้องดูก่อนยืนยัน 2 ข้อ' }))
    expect(look.getByText('ข้อความไม่ชัด')).toBeInTheDocument()
    expect(look.getByText('ระบบเดาว่าบังคับ')).toBeInTheDocument()
    expect(screen.getByText('ไม่ใช่ฟีเจอร์ product จึงไม่เทียบกับ KB ให้ BD ตรวจเอง')).toBeInTheDocument()
    expect(screen.getByText('ไม่บังคับ')).toBeInTheDocument() // R-003's tag
    expect(screen.getByText(/ยังมี/)).toHaveTextContent('ยังมี 2 ข้อ ที่ควรดูก่อน')
    useAssessmentStore.setState({ scope: '' })
  })

  it('edits a requirement: text, category and priority; saving marks it looked at', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ review: [{ id: 'R-001', module: 'Dashboard & Report', text: 'Real-time dashboard', pri: 'M', inf: true, targets: [{ solution: 'crm-plus', service: 'report-analytic' }] }] })
    open('/review')
    expect(screen.getByRole('region', { name: 'ต้องดูก่อนยืนยัน 1 ข้อ' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^R-001 Real-time dashboard/ }))
    const box = screen.getByLabelText('ข้อความ R-001')
    await user.clear(box)
    await user.type(box, 'Dashboard หน่วงไม่เกิน 15 นาที')
    await user.selectOptions(screen.getByLabelText('หมวดของ R-001'), 'System Point')
    await user.click(within(screen.getByRole('group', { name: 'ระดับของ R-001' })).getByRole('button', { name: 'ไม่บังคับ' }))
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(useAssessmentStore.getState().review?.[0]).toMatchObject({ text: 'Dashboard หน่วงไม่เกิน 15 นาที', module: 'System Point', pri: 'O', seen: true, inf: false })
    expect(screen.getByRole('heading', { name: 'ดูครบทุกข้อที่ระบบไม่มั่นใจแล้ว' })).toBeInTheDocument()
  })

  it('edits solution, service, extra targets (max 3) and the API flag in the store', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ review: pending })
    open('/review')
    await user.click(screen.getByRole('button', { name: /^R-001 ทำแอป/ }))
    await user.selectOptions(screen.getByLabelText('Service ของ R-001 ตัวที่ 1'), 'point')
    expect(useAssessmentStore.getState().review?.[0].targets).toEqual([{ solution: 'app-custom', service: 'point' }])
    await user.click(screen.getByRole('button', { name: '+ เพิ่ม target' }))
    await user.click(screen.getByRole('button', { name: '+ เพิ่ม target' }))
    expect(screen.getByLabelText('Solution ของ R-001 ตัวที่ 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ เพิ่ม target' })).not.toBeInTheDocument() // at the maximum of 3
    await user.click(screen.getByRole('checkbox'))
    expect(useAssessmentStore.getState().review?.[0].wantsApi).toBe(true)
  })

  it('adds a requirement, and deletes one with an undo', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ review: pending })
    open('/review')
    await user.click(screen.getByRole('button', { name: '+ เพิ่ม requirement' }))
    await user.type(screen.getByLabelText('Requirement ใหม่'), 'ส่ง SMS แจ้งคะแนน')
    await user.selectOptions(screen.getByLabelText('หมวด'), 'Marketing Automation')
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }))
    expect(useAssessmentStore.getState().review?.at(-1)).toMatchObject({ id: 'R-004', text: 'ส่ง SMS แจ้งคะแนน', module: 'Marketing Automation', pri: 'M', ref: 'เพิ่มโดย BD' })
    await user.click(screen.getByRole('button', { name: /^R-002 / }))
    await user.click(screen.getByRole('button', { name: 'ลบข้อนี้' }))
    expect(useAssessmentStore.getState().review?.map((r) => r.id)).toEqual(['R-001', 'R-003', 'R-004'])
    await user.click(screen.getByRole('button', { name: 'เลิกทำ' }))
    expect(useAssessmentStore.getState().review?.map((r) => r.id)).toEqual(['R-001', 'R-002', 'R-003', 'R-004'])
  })

  it('asks once before judging while something still needs a look, and can go back to it', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ review: pending, apiKey: 'k' })
    const confirm = vi.spyOn(useAssessmentStore.getState(), 'confirmReview')
    open('/review')
    await user.click(screen.getByRole('button', { name: 'ยืนยันและเริ่มเทียบ' }))
    expect(screen.getByText(/ที่ควรดูก่อน: R-001, R-003/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'กลับไปดู' }))
    expect(screen.getByLabelText('ข้อความ R-001')).toHaveFocus()
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('clears the pending review after one confirmation, and cancel keeps it', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ review: pending })
    open('/review')
    await user.click(screen.getByRole('button', { name: 'ล้างรายการ review' }))
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(useAssessmentStore.getState().review).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'ล้างรายการ review' }))
    await user.click(screen.getByRole('button', { name: 'ล้างเลย' }))
    expect(useAssessmentStore.getState().review).toBeNull()
    expect(screen.getByText('ลาก TOR มาวางตรงนี้')).toBeInTheDocument() // back on the home page
  })

  it('keeps the pending review across a reload (it is persisted)', () => {
    useAssessmentStore.setState({ review: pending })
    expect(JSON.parse(localStorage.getItem('tor-scouter')!).state.review).toHaveLength(3)
  })

  it('home points to the review while one is waiting', () => {
    useAssessmentStore.setState({ review: pending, files: [] })
    open('/')
    expect(screen.getByRole('button', { name: /Review solutions/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'แยก Requirement' })).toBeInTheDocument() // the form is free for the next TOR
  })
})

describe('accounts in the app', () => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
  const calls: { url: string; method: string; body?: unknown; headers: Record<string, string> }[] = []
  /** A fake server in account mode. `routes` answer by "METHOD /path". */
  const server = (user: string | null, routes: Record<string, (body: unknown) => Response> = {}) => {
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body, headers: (init.headers ?? {}) as Record<string, string> })
      const hit = routes[`${method} ${url}`]
      if (hit) return hit(body)
      if (url === '/api/auth' && method === 'GET') return json({ mode: 'account', user: user && { username: user } })
      if (url === '/api/key') return json(null)
      return json({ topics: [] })
    }))
  }
  const reset = (extra: object = {}) => useAssessmentStore.setState({ mode: 'unknown', user: null, owner: null, storedKey: null, historyId: null, historyError: null, serverDefault: null, files: [], customer: '', result: null, review: null, coverage: null, valid: {}, apiKey: '', ...extra })
  afterEach(() => { vi.unstubAllGlobals(); reset() })
  const saved = [req('R-001', 'full'), req('R-002', 'none')]

  it('shows the sign-in form instead of the app when the server wants a login', async () => {
    reset()
    server(null)
    open('/matrix')
    expect(await screen.findByLabelText('ชื่อผู้ใช้')).toBeInTheDocument()
    expect(screen.queryByText('Compliance matrix')).not.toBeInTheDocument()
  })

  it('signs in, then shows the app with the name and a sign-out button', async () => {
    const user = userEvent.setup()
    reset()
    server(null, { 'POST /api/auth?action=login': () => json({ mode: 'account', user: { username: 'ann' } }) })
    open('/')
    await user.type(await screen.findByLabelText('ชื่อผู้ใช้'), 'ann')
    await user.type(screen.getByLabelText('รหัสผ่าน'), 'a long password')
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(await screen.findByRole('button', { name: /บัญชีของคุณ ann/ })).toBeInTheDocument()
    const login = calls.find((c) => c.url === '/api/auth?action=login')!
    expect(login.headers['x-requested-with']).toBe('tor-scouter')
    expect(login.body).toEqual({ username: 'ann', password: 'a long password' })
  })

  it('shows the server\'s sign-in error', async () => {
    const user = userEvent.setup()
    reset()
    server(null, { 'POST /api/auth?action=login': () => json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401) })
    open('/')
    await user.type(await screen.findByLabelText('ชื่อผู้ใช้'), 'ann')
    await user.type(screen.getByLabelText('รหัสผ่าน'), 'wrong password!')
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่ถูกต้อง')
  })

  it('sign-out removes the results, review, key and name from the browser', async () => {
    const user = userEvent.setup()
    reset({ owner: 'ann', result: saved, review: [{ id: 'R-9', module: 'M', text: 't' }], coverage: [], valid: { 'R-001': 'ok' }, apiKey: 'typed-key-123456', storedKey: { provider: 'gemini', model: 'm', last4: '1234' } })
    server('ann')
    open('/matrix')
    await user.click(await screen.findByRole('button', { name: /บัญชีของคุณ ann/ }))
    await user.click(screen.getByRole('button', { name: 'ออกจากระบบ' }))
    const s = useAssessmentStore.getState()
    expect([s.result, s.review, s.coverage, s.owner, s.user, s.storedKey]).toEqual([null, null, null, null, null, null])
    expect(s.valid).toEqual({})
    expect(s.apiKey).toBe('')
    expect(JSON.parse(localStorage.getItem('tor-scouter')!).state.result).toBeNull()
  })

  it('wipes data that belongs to someone else, and adopts data from before accounts', async () => {
    reset({ owner: 'bob', result: saved })
    server('ann')
    await useAssessmentStore.getState().loadAuth()
    expect(useAssessmentStore.getState()).toMatchObject({ result: null, owner: 'ann', user: 'ann' })
    reset({ owner: null, result: saved })
    await useAssessmentStore.getState().loadAuth()
    expect(useAssessmentStore.getState()).toMatchObject({ owner: 'ann' })
    expect(useAssessmentStore.getState().result).toHaveLength(2)
  })

  it('draws nothing but a status until it knows who is signed in, when saved data belongs to a person', () => {
    reset({ owner: 'ann', result: saved })
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // the server has not answered
    open('/matrix')
    expect(screen.getByRole('status', { name: 'กำลังตรวจสอบการล็อกอิน' })).toBeInTheDocument()
    expect(screen.queryByText('requirement R-002')).not.toBeInTheDocument()
  })

  it('a 401 in the middle of a run ends the session on screen', async () => {
    reset({ mode: 'account', user: 'ann', owner: 'ann', result: saved, review: [{ id: 'R-001', module: 'M', text: 't' }] })
    server('ann', { 'POST /api/judge': () => json({ error: 'login' }, 401), 'POST /api/questions': () => json({ error: 'login' }, 401) })
    useAssessmentStore.setState({ storedKey: { provider: 'gemini', model: 'm', last4: '1234' } })
    await useAssessmentStore.getState().confirmReview()
    expect(useAssessmentStore.getState()).toMatchObject({ user: null, owner: null, result: null, review: null })
  })

  it('Run needs no typed key once a key is stored', () => {
    reset({ mode: 'account', user: 'ann', owner: 'ann', storedKey: { provider: 'gemini', model: 'gemini-3.8-flash', last4: '1234' }, apiKey: '', files: [new File(['x'], 'tor.pdf')] })
    server('ann')
    open('/')
    expect(screen.getByRole('button', { name: 'แยก Requirement' })).toBeEnabled()
  })

  it('saves a finished run to history, and later validation changes to the same entry', async () => {
    reset({ mode: 'account', user: 'ann', owner: 'ann', customer: 'ACME', project: { ...EMPTY_PROJECT, title: 'TOR CRM', due: '2026-12-15' }, files: [new File(['x'], 'tor.pdf')], storedKey: { provider: 'gemini', model: 'm', last4: '1234' }, review: [{ id: 'R-001', module: 'M', text: 't', targets: [{ solution: 'app-custom', service: 'point' }] }], result: null })
    server('ann', {
      'POST /api/judge': (b) => json({ results: (b as { requirements: { id: string }[] }).requirements.map((r) => req(r.id, 'full')) }),
      'POST /api/history': () => json({ id: 'h-1' }),
      'PUT /api/history?id=h-1': () => json({ ok: true }),
    })
    await useAssessmentStore.getState().confirmReview()
    await waitFor(() => expect(useAssessmentStore.getState().historyId).toBe('h-1'))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/scouter?action=group')).toBe(true)) // its gaps get grouped in the Feature Scouter
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/history')!
    expect(post.body).toMatchObject({ customer: 'ACME', files: ['tor.pdf'], data: { meta: { title: 'TOR CRM', due: '2026-12-15' }, result: [{ id: 'R-001' }] } })
    useAssessmentStore.setState({ selId: 'R-001' })
    useAssessmentStore.getState().validate('ok')
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/history?id=h-1')).toBe(true), { timeout: 3000 })
    expect(calls.find((c) => c.method === 'PUT')!.body).toMatchObject({ data: { meta: { title: 'TOR CRM' }, valid: { 'R-001': 'ok' } } }) // a PUT replaces data: the details must ride along
  })

  it('keeps showing results when saving history fails, and says so', async () => {
    reset({ mode: 'account', user: 'ann', owner: 'ann', storedKey: { provider: 'gemini', model: 'm', last4: '1234' }, review: [{ id: 'R-001', module: 'M', text: 't' }] })
    server('ann', {
      'POST /api/judge': () => json({ results: [req('R-001', 'full')] }),
      'POST /api/history': () => json({ error: 'ไม่ได้บันทึกประวัติ: ผลใหญ่เกินไป' }, 413),
    })
    await useAssessmentStore.getState().confirmReview()
    await waitFor(() => expect(useAssessmentStore.getState().historyError).toContain('ใหญ่เกินไป'))
    expect(useAssessmentStore.getState().result).toHaveLength(1)
  })

  it('lists history, opens an entry into the app, and deletes with one confirmation', async () => {
    const user = userEvent.setup()
    reset({ owner: 'ann' })
    server('ann', {
      'GET /api/history': () => json({ entries: [{ id: 'h-1', customer: 'ACME', files: ['tor.pdf'], counts: { full: 1, none: 1 }, createdAt: '2026-11-20T10:00:00.000Z' }] }),
      'GET /api/history?id=h-1': () => json({ entry: { id: 'h-1', customer: 'ACME', data: { result: saved, coverage: null, valid: { 'R-001': 'flag' } } } }),
      'DELETE /api/history?id=h-1': () => json({ ok: true }),
    })
    open('/history')
    expect(await screen.findByText('ACME')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^ลบ ACME/ }))
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.getByText('ACME')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^เปิด ACME/ }))
    await waitFor(() => expect(useAssessmentStore.getState().historyId).toBe('h-1'))
    expect(useAssessmentStore.getState()).toMatchObject({ customer: 'ACME', valid: { 'R-001': 'flag' } })
    expect(useAssessmentStore.getState().result).toHaveLength(2)
    expect(await screen.findByText('requirement R-002')).toBeInTheDocument() // landed on the result summary
  })

  it('draws a strip of one bar per requirement in each row, lightest status first', async () => {
    reset({ owner: 'ann' })
    server('ann', {
      'GET /api/history': () => json({ entries: [{ id: 'h-1', customer: 'ACME', files: [], counts: { none: 2, full: 3, verify: 1 }, createdAt: '2026-11-20T10:00:00.000Z' }] }),
    })
    open('/history')
    const row = (await screen.findByText('ACME')).closest('[role="row"]') as HTMLElement
    const bars = [...row.querySelectorAll('span[aria-hidden] > i')] as HTMLElement[]
    expect(bars).toHaveLength(6)
    expect(bars[0].style.background).toContain('--st-full-dot') // fully supported first, the heaviest and the unknown last
    expect(bars[3].style.background).toContain('--st-none-dot')
    expect(row).toHaveTextContent('60%') // 3 of the 5 that could be judged
    expect(row).toHaveTextContent('ยื่นได้ แต่มีเงื่อนไข')
    expect(row).toHaveTextContent('เพราะข้อบังคับไม่รองรับ 2 ข้อ')
  })

  it('a pointed-at row hides the line above it and the one below, as in the mockup', async () => {
    reset({ owner: 'ann' })
    const e = (id: string, customer: string) => ({ id, customer, files: [], counts: { full: 1 }, createdAt: '2026-11-20T10:00:00.000Z' })
    server('ann', { 'GET /api/history': () => json({ entries: [e('h-1', 'ACME'), e('h-2', 'BETA')] }) })
    open('/history')
    const rows = [...(await screen.findByText('ACME')).closest('[role="rowgroup"]')!.querySelectorAll(':scope > [role="row"]')] as HTMLElement[]
    expect(rows).toHaveLength(2)
    expect(rows[0].className).toContain('first:border-t-0') // the header line is enough above the first row
    for (const r of rows) expect(r.className).toMatch(/border-t .*hover:border-transparent .*hover:bg-tint .*\[&:hover\+\[role=row\]\]:border-transparent/)
  })

  it('an optional requirement draws a short bar, and does not count as a deal breaker', async () => {
    reset({ owner: 'ann' })
    server('ann', {
      'GET /api/history': () => json({ entries: [{ id: 'h-1', customer: 'ACME', files: [], counts: { full: 9, none: 1, 'o:none': 1 }, createdAt: '2026-11-20T10:00:00.000Z' }] }),
    })
    open('/history')
    const row = (await screen.findByText('ACME')).closest('[role="row"]') as HTMLElement
    const bars = [...row.querySelectorAll('span[aria-hidden] > i')] as HTMLElement[]
    expect(bars[9].style.height).toBe('52%')
    expect(row).toHaveTextContent('90%')
    expect(row).toHaveTextContent('ยื่นได้เพราะข้อบังคับรองรับได้ทุกข้อ')
  })

  it('a TOR waiting for its review is in the list, and opens on the review', async () => {
    const user = userEvent.setup()
    reset({ owner: 'ann' })
    server('ann', {
      'GET /api/history': () => json({ entries: [{ id: 'h-2', customer: 'ACME', title: 'TOR CRM', files: [], counts: { review: 4 }, createdAt: '2026-11-20T10:00:00.000Z' }] }),
      'GET /api/history?id=h-2': () => json({ entry: { id: 'h-2', customer: 'ACME', data: { meta: { title: 'TOR CRM' }, scope: 'ระบบสมาชิก', review: [{ id: 'R-001', module: 'Mission', text: 'ภารกิจ' }], terms: [], confirmed: null, result: [], coverage: null, valid: {} } } }),
    })
    open('/history')
    const row = (await screen.findByText('TOR CRM')).closest('[role="row"]') as HTMLElement
    expect(row).toHaveTextContent('ยังไม่ได้เทียบกับ KB')
    expect(row).toHaveTextContent('รอตรวจ requirement')
    expect(row).toHaveTextContent('4 ข้อ กดเพื่อตรวจแล้วเริ่มเทียบ')
    await user.click(screen.getByRole('button', { name: 'เปิด TOR CRM' }))
    expect(await screen.findByText('ขั้นที่ 1 จาก 2 · ตรวจ requirement')).toBeInTheDocument()
    expect(useAssessmentStore.getState()).toMatchObject({ historyId: 'h-2', result: null, scope: 'ระบบสมาชิก' })
    expect(useAssessmentStore.getState().review).toHaveLength(1)
  })

  it('deletes an entry after confirming', async () => {
    const user = userEvent.setup()
    reset({ owner: 'ann' })
    server('ann', {
      'GET /api/history': () => json({ entries: [{ id: 'h-1', customer: 'ACME', files: [], counts: {}, createdAt: '2026-11-20T10:00:00.000Z' }] }),
      'DELETE /api/history?id=h-1': () => json({ ok: true }),
    })
    open('/history')
    await user.click(await screen.findByRole('button', { name: /^ลบ ACME/ }))
    await user.click(screen.getByRole('button', { name: 'ลบเลย' }))
    await waitFor(() => expect(screen.queryByText('ACME')).not.toBeInTheDocument())
    expect(calls.find((c) => c.method === 'DELETE')!.headers['x-requested-with']).toBe('tor-scouter')
  })

  it('AI settings: shows only the last 4 of a stored key, saves a typed one once, and clears the field', async () => {
    const user = userEvent.setup()
    reset({ owner: 'ann', provider: 'gemini', model: 'gemini-3.8-flash' })
    server('ann', { 'PUT /api/key': () => json({ provider: 'gemini', model: 'gemini-3.8-flash', last4: '9876' }) })
    open('/ai-settings')
    await user.type(await screen.findByLabelText(/API key/), 'AIza-super-secret-9876')
    await user.click(screen.getByRole('button', { name: 'บันทึก key' }))
    expect(await screen.findByText(/••••9876/)).toBeInTheDocument()
    expect(useAssessmentStore.getState().apiKey).toBe('')
    expect(document.body.textContent).not.toContain('super-secret')
    expect((screen.getByLabelText(/API key/) as HTMLInputElement).value).toBe('')
    expect(calls.find((c) => c.method === 'PUT')!.body).toMatchObject({ provider: 'gemini', key: 'AIza-super-secret-9876' })
    expect(screen.queryByLabelText(/Access code/)).not.toBeInTheDocument()
  })

  it('Test connection in account mode sends the CSRF header and never the team code', async () => {
    const user = userEvent.setup()
    reset({ owner: 'ann', provider: 'gemini', model: 'gemini-3.8-flash', accessCode: 'leftover-team-code' })
    server('ann', { 'POST /api/status': () => json({ ok: true, ms: 12 }) })
    open('/ai-settings')
    await user.type(await screen.findByLabelText(/API key/), 'AIza-test-key-1234')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))
    await screen.findByText(/Working/)
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/status')!
    expect(post.headers['x-requested-with']).toBe('tor-scouter')
    expect(post.headers['x-access-code']).toBeUndefined()
    expect(post.headers['x-llm-key']).toBe('AIza-test-key-1234')
  })

  describe('profile menu', () => {
    const email = 'aphichai.very.long.name@buzzebees.com'
    const openMenu = async (admin = false) => {
      reset({ owner: email })
      vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url === '/api/auth' ? { mode: 'account', user: { username: email }, admin } : url === '/api/key' ? null : { topics: [] })))
      const user = userEvent.setup()
      open('/ai-settings')
      const trigger = await screen.findByRole('button', { name: `บัญชีของคุณ ${email}` })
      return { user, trigger }
    }

    it('shows the whole email in a panel, not cut, with sign-out inside', async () => {
      const { user, trigger } = await openMenu()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText(email)).not.toBeInTheDocument()
      await user.click(trigger)
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      const full = screen.getByText(email)
      expect(full).toHaveClass('break-all') // wraps instead of ending in an ellipsis
      expect(full).not.toHaveClass('truncate')
      expect(screen.getByRole('button', { name: 'ออกจากระบบ' })).toBeInTheDocument()
    })

    it('shows the name before the @ on the button, and the whole email only in the panel', async () => {
      const { user, trigger } = await openMenu()
      expect(trigger).toHaveTextContent('aphichai.very.long.name')
      expect(trigger).not.toHaveTextContent('@')
      await user.click(trigger)
      expect(screen.getByText('aphichai.very.long.name', { selector: 'span.font-semibold' })).toBeInTheDocument() // the name, bold, above the email
      expect(screen.getByText(email)).toBeInTheDocument()
    })

    it('shows an Admin badge only for admins', async () => {
      const a = await openMenu(true)
      await a.user.click(a.trigger)
      expect(screen.getByText('Admin')).toBeInTheDocument()
    })

    it('has no Admin badge for a normal user', async () => {
      const a = await openMenu(false)
      await a.user.click(a.trigger)
      expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    })

    it('keeps the theme switch in the menu, not beside it, and it still works', async () => {
      useAssessmentStore.setState({ theme: 'light' })
      const { user, trigger } = await openMenu()
      expect(screen.queryByRole('button', { name: 'โหมดมืด' })).not.toBeInTheDocument() // nothing loose in the header
      await user.click(trigger)
      const sw = screen.getByRole('button', { name: 'โหมดมืด' })
      expect(sw).toHaveAttribute('aria-pressed', 'false')
      await user.click(sw)
      expect(useAssessmentStore.getState().theme).toBe('dark')
      expect(screen.getByRole('button', { name: 'โหมดมืด' })).toHaveAttribute('aria-pressed', 'true')
      useAssessmentStore.setState({ theme: 'system' })
    })

    it('closes with Escape and gives focus back to the button, and closes on an outside click', async () => {
      const { user, trigger } = await openMenu()
      await user.click(trigger)
      await user.keyboard('{Escape}')
      expect(screen.queryByText(email)).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
      await user.click(trigger)
      await user.click(document.body)
      expect(screen.queryByText(email)).not.toBeInTheDocument()
    })
  })

  it('stateless mode shows no sign-in and no sign-out', async () => {
    reset()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url === '/api/auth' ? { mode: 'stateless', user: null } : { topics: [] })))
    open('/')
    await waitFor(() => expect(useAssessmentStore.getState().mode).toBe('stateless'))
    expect(screen.queryByRole('button', { name: 'ออกจากระบบ' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ชื่อผู้ใช้')).not.toBeInTheDocument()
  })
})

describe('the taxonomy comes from the server', () => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
  const custom = {
    solutions: [{ id: 'crm-plus', label: 'CRM+ renamed', hint: '', archived: false }, { id: 'old-solution', label: 'Old solution', hint: '', archived: true }],
    services: [{ id: 'billing', label: 'Billing', hint: '', confirmed: true, archived: false }, { id: 'point', label: 'Point Service', hint: '', confirmed: false, archived: false }, { id: 'retired', label: 'Retired svc', hint: '', confirmed: true, archived: true }],
  }
  afterEach(() => { vi.unstubAllGlobals(); useAssessmentStore.setState({ mode: 'unknown', user: null, taxonomy: DEFAULT_TAXONOMY }) })

  it('loads the saved taxonomy for a signed-in person, keeps the built-in one otherwise or on failure', async () => {
    useAssessmentStore.setState({ mode: 'stateless', user: null })
    const spy = vi.fn(async () => json({ taxonomy: custom }))
    vi.stubGlobal('fetch', spy)
    await useAssessmentStore.getState().loadTaxonomy()
    expect(spy).not.toHaveBeenCalled() // no accounts: nothing to fetch
    useAssessmentStore.setState({ mode: 'account', user: 'ann' })
    await useAssessmentStore.getState().loadTaxonomy()
    expect(useAssessmentStore.getState().taxonomy.services.map((s) => s.id)).toContain('billing')
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)))
    await useAssessmentStore.getState().loadTaxonomy()
    expect(useAssessmentStore.getState().taxonomy.services.map((s) => s.id)).toContain('billing') // a failure changes nothing
    vi.stubGlobal('fetch', vi.fn(async () => json({ taxonomy: { solutions: 'x' } })))
    await useAssessmentStore.getState().loadTaxonomy()
    expect(useAssessmentStore.getState().taxonomy.solutions).toHaveLength(2) // garbage is ignored
  })

  it('Review offers the saved services, hides archived ones, and still shows an archived one that is selected', () => {
    useAssessmentStore.setState({
      taxonomy: custom,
      review: [{ id: 'R-001', module: 'M', text: 't', targets: [{ solution: 'old-solution', service: 'retired' }] }, { id: 'R-002', module: 'M', text: 't2', targets: [{ solution: 'crm-plus', service: 'billing' }] }],
    })
    open('/review')
    expect(screen.getAllByText('CRM+ renamed › Billing').length).toBeGreaterThan(0) // the row says where it lands, with the saved names
    const optionsOf = (label: string) => [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.textContent)
    fireEvent.click(screen.getByRole('button', { name: /^R-002 t2/ }))
    const r2 = optionsOf('Service ของ R-002 ตัวที่ 1')
    expect(r2).toContain('Billing')
    expect(r2).toContain('Point Service (ยังไม่ยืนยัน)')
    expect(r2.some((t) => t?.includes('Retired'))).toBe(false) // archived and not selected: hidden
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    fireEvent.click(screen.getByRole('button', { name: /^R-001 t / }))
    expect(optionsOf('Service ของ R-001 ตัวที่ 1').some((t) => t === 'Retired svc (เก็บแล้ว)')).toBe(true) // archived but chosen: kept visible
    useAssessmentStore.setState({ review: null })
  })

  it('Matrix and the Excel export use the saved labels', async () => {
    useAssessmentStore.setState({ taxonomy: custom, result: [{ id: 'R-001', module: 'M', s: 'full', conf: '1%', text: 't', reason: 'r', evidence: 'e', rec: 'c', targets: [{ solution: 'crm-plus', service: 'billing' }] }], selId: 'R-001' })
    open('/matrix')
    expect(screen.getAllByText('CRM+ renamed › Billing').length).toBeGreaterThan(0)
    const { buildSheets } = await import('@/lib/exportXlsx')
    const { fromReqs } = await import('@/lib/assessment')
    const row = buildSheets(fromReqs(useAssessmentStore.getState().result!), null, {}, custom)[0].data[1] as { value: string }[]
    expect(row.slice(2, 4).map((c) => c.value)).toEqual(['CRM+ renamed', 'Billing'])
    useAssessmentStore.setState({ result: null })
  })
})

describe('knowledge base page', () => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
  const note = (extra: object = {}) => ({ path: 'point/earn-rules.md', title: 'Earn rules', module: 'Point', service: 'point', solutions: [], support: 'config', body: 'ตั้งค่าได้ **ต่อ Brand** ดู [[point/expiry-policy]]', updatedAt: 'tok-1', updatedBy: 'ann', ...extra })
  const note2 = note({ path: 'point/expiry-policy.md', title: 'Expiry policy', support: 'full', body: 'หมดอายุได้หลายแบบ', updatedAt: 'tok-2' })
  const promptsView = (extra: object = {}) => Object.fromEntries(['extract', 'classify', 'judge', 'questions'].map((k) => [k, { body: `${k} default text`, isDefault: true, defaultBody: `${k} default text`, updatedAt: null, ...(k === 'judge' ? extra : {}) }]))
  let calls: { url: string; method: string; body?: unknown }[] = []
  let adminFlag = false // what the fake /api/auth reports
  /** A fake /api/knowledge. `routes` answer by "METHOD part" and win over the defaults. */
  const server = (o: { status?: 'database' | 'defaults'; routes?: Record<string, (body: unknown, url: string) => Response>; prompts?: Record<string, unknown> } = {}) => {
    calls = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body })
      const part = new URL(url, 'http://x').searchParams.get('part')
      const hit = o.routes?.[`${method} ${part}`]
      if (hit) return hit(body, url)
      if (url === '/api/auth') return json({ mode: 'account', user: { username: 'ann' }, admin: adminFlag })
      if (method === 'GET' && part === 'notes') return json({ status: o.status ?? 'database', notes: [note(), note2] })
      if (method === 'GET' && part === 'taxonomy') return json({ status: 'database', taxonomy: DEFAULT_TAXONOMY, updatedAt: 'tax-1' })
      if (method === 'GET' && part === 'prompts') return json({ status: 'database', prompts: o.prompts ?? promptsView() })
      return json({ topics: [] })
    }))
  }
  const as = (admin: boolean) => { adminFlag = admin; useAssessmentStore.setState({ mode: 'account', user: 'ann', owner: 'ann', admin }) }
  afterEach(() => { vi.unstubAllGlobals(); useAssessmentStore.setState({ mode: 'unknown', user: null, admin: false, owner: null, taxonomy: DEFAULT_TAXONOMY }) })

  it('a normal user reads notes, prompts and taxonomy, and cannot edit anything', async () => {
    as(false)
    server()
    open('/knowledge-base')
    const user = userEvent.setup()
    expect(await screen.findByText('ดูได้อย่างเดียว')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Solution/ })).toHaveAttribute('aria-selected', 'true') // it opens on Solution & Service: the first step of a run
    await user.click(screen.getByRole('tab', { name: /^Capabilities/ }))
    expect(await screen.findByRole('heading', { name: 'Earn rules' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Note ใหม่/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'บันทึก' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ชื่อ')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^Prompts/ }))
    expect(screen.getAllByText('judge default text').length).toBeGreaterThan(0)
    expect(screen.queryByRole('textbox', { name: /Judge/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^Solution/ }))
    expect(screen.queryByRole('button', { name: /บันทึก taxonomy/ })).not.toBeInTheDocument()
    expect(calls.every((c) => c.method === 'GET')).toBe(true) // nothing was written
  })

  it('lists Taxonomy first, then Notes, then Prompts, and says what the open one is for', async () => {
    as(false)
    server()
    open('/knowledge-base')
    const user = userEvent.setup()
    const names = (await screen.findAllByRole('tab')).map((t) => t.textContent)
    expect(names).toEqual(['Solution & Service · ใช้จัดหมวด', 'Capabilities · สิ่งที่ Product ทำได้', 'Prompts · คำสั่งถึง AI'])
    expect(screen.getByText(/ใช้ตอนจัดหมวด/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^Capabilities/ }))
    expect(screen.getByText(/ใช้ตอนประเมิน/)).toBeInTheDocument()
    expect(screen.queryByText(/ใช้ตอนจัดหมวด/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^Prompts/ }))
    expect(screen.getByText(/แยก requirement ออกจาก TOR/)).toBeInTheDocument()
  })

  it('an [[note link]] opens that note', async () => {
    as(false)
    server()
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Capabilities/ }))
    await user.click(await screen.findByRole('button', { name: 'point/expiry-policy' }))
    expect(await screen.findByRole('heading', { name: 'Expiry policy' })).toBeInTheDocument()
  })

  it('an admin edits a note, sends the token it loaded, and sees a stale save refused', async () => {
    as(true)
    server({ routes: { 'PUT notes': () => json({ error: 'มีคนแก้รายการนี้ไปก่อนแล้ว โหลดใหม่แล้วแก้อีกครั้ง' }, 409) } })
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Capabilities/ }))
    const title = await screen.findByDisplayValue('Earn rules')
    await user.clear(title)
    await user.type(title, 'Earn rules v2')
    expect(screen.getAllByText('ยังไม่ได้บันทึก').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(await screen.findByText(/มีคนแก้รายการนี้ไปก่อนแล้ว/)).toBeInTheDocument()
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.body).toMatchObject({ path: 'point/earn-rules.md', title: 'Earn rules v2', updatedAt: 'tok-1', service: 'point' })
  })

  it('warns before leaving unsaved changes, and can keep or drop them', async () => {
    as(true)
    server()
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Capabilities/ }))
    const title = await screen.findByDisplayValue('Earn rules')
    await user.type(title, ' edited')
    await user.click(screen.getByRole('button', { name: /Expiry policy/ }))
    expect(screen.getByText('ยังไม่ได้บันทึกการแก้ไข')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'กลับไปแก้ต่อ' }))
    expect(screen.getByDisplayValue('Earn rules edited')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Expiry policy/ }))
    await user.click(screen.getByRole('button', { name: 'ทิ้งการแก้ไขแล้วไปต่อ' }))
    expect(screen.getByDisplayValue('Expiry policy')).toBeInTheDocument()
  })

  it('lists the services that still need a note, and an admin starts a note on one', async () => {
    const user = userEvent.setup()
    as(true)
    server()
    open('/knowledge-base')
    await user.click(await screen.findByRole('tab', { name: /^Capabilities/ }))
    expect(screen.queryByText('note ทั้งหมด')).not.toBeInTheDocument() // no summary counts
    const { activeServices } = await import('@/data/taxonomy')
    const missing = activeServices(DEFAULT_TAXONOMY).filter((sv) => sv.id !== 'point') // only Point has notes
    const panel = within(screen.getByRole('region', { name: 'ต้องเขียน note เพิ่ม' }))
    expect(panel.getAllByRole('button', { name: /^เขียน note ของ / })).toHaveLength(missing.length)
    await user.click(panel.getByRole('button', { name: `เขียน note ของ ${missing[0].label}` }))
    const notesPanel = within(screen.getByRole('region', { name: 'หมวด Notes' }))
    expect((notesPanel.getByLabelText('Service') as HTMLSelectElement).value).toBe(missing[0].id) // the new note starts on that service
  })

  it('an admin creates a note and deletes one after a confirmation', async () => {
    as(true)
    server({ routes: { 'POST notes': () => json({ path: 'point/new-one.md', updatedAt: 'tok-9' }), 'DELETE notes': () => json({ ok: true }) } })
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Capabilities/ }))
    await user.click(await screen.findByRole('button', { name: /Note ใหม่/ }))
    const notesPanel = within(screen.getByRole('region', { name: 'หมวด Notes' }))
    await user.type(notesPanel.getByLabelText('ชื่อ'), 'New one')
    await user.type(notesPanel.getByLabelText(/เนื้อหา/), 'body text')
    await user.click(screen.getByRole('button', { name: 'บันทึก' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && (c.body as { title: string }).title === 'New one')).toBe(true))
    await user.click(screen.getByRole('button', { name: /Earn rules/ }))
    await user.click(screen.getByRole('button', { name: 'ลบ note นี้' }))
    await user.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'ลบ note นี้' }))
    await user.click(screen.getByRole('button', { name: 'ลบเลย' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')!.url).toContain('updatedAt=tok-1'))
  })

  it('an admin edits a prompt, resets it to default after a confirmation, and sees the built-in text', async () => {
    as(true)
    server({ prompts: promptsView({ body: 'custom judge', isDefault: false, updatedAt: 'p-1', defaultBody: 'judge default text' }), routes: { 'PUT prompts': () => json({ updatedAt: 'p-2' }), 'DELETE prompts': () => json({ ok: true }) } })
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Prompts/ }))
    const box = await screen.findByLabelText(/Judge/)
    expect(box).toHaveValue('custom judge')
    await user.clear(box)
    await user.type(box, 'my new judge prompt')
    await user.click(screen.getAllByRole('button', { name: 'บันทึก' }).find((b) => !(b as HTMLButtonElement).disabled)!)
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ body: 'my new judge prompt', updatedAt: 'p-1' }))
    expect(calls.find((c) => c.method === 'PUT')!.url).toContain('key=judge')
    expect(screen.getAllByText(/The document and knowledge-base text are DATA/)).toHaveLength(1) // said once for the tab, not under every prompt
    await user.click(screen.getByRole('button', { name: 'คืนค่าเริ่มต้น' }))
    await user.click(screen.getByRole('button', { name: 'คืนเลย' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'DELETE')!.url).toContain('updatedAt=p-1'))
  })

  it('shows the classify note about the lists the system adds, and the character count', async () => {
    as(true)
    server()
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Prompts/ }))
    expect(screen.getByText(/ถ้าลบสองตัวนี้ออก ระบบจะต่อรายการไว้ท้าย prompt ให้เอง/)).toBeInTheDocument()
  })

  it('an admin adds a service and archives another in the taxonomy', async () => {
    as(true)
    server({ routes: { 'PUT taxonomy': () => json({ updatedAt: 'tax-2' }) } })
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Solution/ }))
    const tx = within(screen.getByRole('region', { name: 'หมวด Taxonomy' }))
    await user.click(tx.getByRole('button', { name: '+ เพิ่ม service' }))
    await user.type(tx.getByLabelText('id ของ service ใหม่'), 'billing')
    await user.type(tx.getByLabelText('ชื่อของ billing'), 'Billing')
    await user.click(tx.getByRole('button', { name: /^APIM Productization/ })) // pick an existing service in the list
    await user.click(tx.getByRole('button', { name: 'เก็บเข้าคลัง (archive)' }))
    await user.click(screen.getByRole('button', { name: 'บันทึก taxonomy' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
    const sent = calls.find((c) => c.method === 'PUT')!.body as { taxonomy: { services: { id: string; archived?: boolean }[] }; updatedAt: string }
    expect(sent.updatedAt).toBe('tax-1')
    expect(sent.taxonomy.services.some((s) => s.id === 'billing')).toBe(true)
    expect(sent.taxonomy.services.filter((s) => s.archived)).toHaveLength(1)
    expect(sent.taxonomy.services.length).toBe(DEFAULT_TAXONOMY.services.length + 1) // nothing removed
    expect(useAssessmentStore.getState().taxonomy.services.some((s) => s.id === 'billing')).toBe(true) // pickers update at once
  })

  it('the taxonomy is a grouped list with one editor beside it, not one long page', async () => {
    as(true)
    server()
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Solution/ }))
    const tx = within(screen.getByRole('region', { name: 'หมวด Taxonomy' }))
    expect(tx.getByRole('region', { name: 'Solution' })).toBeInTheDocument()
    expect(tx.getByRole('region', { name: 'Service' })).toBeInTheDocument()
    expect(tx.getByText(/ยืนยันแล้ว · 5/)).toBeInTheDocument() // the four confirmed core services and the new-development bucket
    expect(tx.getByText(/ยังไม่ยืนยัน · 8/)).toBeInTheDocument() // the eight inferred ones
    expect(tx.getAllByRole('textbox').length).toBeLessThan(6) // one item's fields, not a form per item
    expect(tx.getByText('2 note')).toBeInTheDocument() // the notes that use a service are counted next to it (both fake notes use Point Service)
    await user.click(tx.getByRole('button', { name: /^Point Service/ }))
    expect(tx.getByDisplayValue('Point Service')).toBeInTheDocument()
    expect(tx.getByText('ใช้ใน 2 note')).toBeInTheDocument()
  })

  it('a normal user reads a taxonomy item as text', async () => {
    as(false)
    server()
    open('/knowledge-base')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /^Solution/ }))
    const tx = within(screen.getByRole('region', { name: 'หมวด Taxonomy' }))
    await user.click(tx.getByRole('button', { name: /^User Management/ }))
    expect(tx.getByRole('heading', { name: 'User Management' })).toBeInTheDocument()
    expect(tx.queryByRole('textbox')).not.toBeInTheDocument()
    expect(tx.queryByRole('button', { name: /\+ เพิ่ม/ })).not.toBeInTheDocument()
  })

  it('says plainly when it is running on defaults, and offers the import to an admin only', async () => {
    as(true)
    server({ status: 'defaults' })
    open('/knowledge-base')
    expect(await screen.findByText(/ตอนนี้ใช้ค่าเริ่มต้น/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'นำเข้าจากไฟล์' })).toBeInTheDocument()
  })

  it('a normal user sees the defaults warning but no import button', async () => {
    as(false)
    server({ status: 'defaults' })
    open('/knowledge-base')
    expect(await screen.findByText(/ตอนนี้ใช้ค่าเริ่มต้น/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'นำเข้าจากไฟล์' })).not.toBeInTheDocument()
  })
})

describe('ChatGPT in AI settings', () => {
  it('is a choice with its own models and key label, and switching to it picks its first model', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: '' })
    open('/ai-settings')
    await user.click(screen.getByRole('radio', { name: 'ChatGPT (OpenAI)' }))
    expect(useAssessmentStore.getState()).toMatchObject({ provider: 'openai', model: 'gpt-5' })
    expect(screen.getByLabelText('OpenAI API key')).toBeInTheDocument()
    expect([...(screen.getByLabelText('Model') as HTMLSelectElement).options].map((o) => o.value)).toContain('gpt-4.1')
    useAssessmentStore.setState({ provider: 'anthropic', model: 'claude-sonnet-5-5' })
  })
})

describe('header actions', () => {
  it('has อัปโหลด TOR as the first menu item instead of a separate button, on every page', () => {
    open('/matrix')
    const nav = within(screen.getByRole('navigation', { name: 'Main' }))
    const links = nav.getAllByRole('link')
    expect(links[0]).toHaveTextContent('อัปโหลด TOR')
    expect(links[0]).toHaveAttribute('href', '/')
    expect(links.map((l) => l.textContent)).toEqual(['อัปโหลด TOR', 'TOR ทั้งหมด', 'Knowledge base', 'AI settings'])
    expect(within(document.querySelector('header') as HTMLElement).queryByRole('link', { name: /อัปโหลด TOR →/ })).not.toBeInTheDocument()
  })

  it('page headers carry no "01 / section" label', () => {
    for (const path of ['/', '/history', '/knowledge-base', '/ai-settings']) {
      const { unmount } = open(path)
      expect(screen.queryByText(/^0\d \//)).not.toBeInTheDocument()
      unmount()
    }
  })

  it('without an account the theme switch stands alone in the header', () => {
    useAssessmentStore.setState({ mode: 'stateless', user: null })
    open('/')
    expect(within(document.querySelector('header') as HTMLElement).getByRole('button', { name: 'โหมดมืด' })).toBeInTheDocument()
  })
})

describe('Executive summary: what to build and which tools', () => {
  const t = (solution: string, service: string) => ({ solution, service })
  const withTargets = (id: string, s: Req['s'], targets: Req['targets'], extra: Partial<Req> = {}): Req => ({ ...req(id, s), targets, ...extra })

  it('lists each solution with its Buzzebees tools, new development and API requests', () => {
    useAssessmentStore.setState({
      result: [
        withTargets('R-001', 'full', [t('app-custom', 'user-management')]),
        withTargets('R-002', 'config', [t('app-custom', 'user-management'), t('crm-plus', 'campaign-management')]),
        withTargets('R-003', 'custom', [t('app-custom', 'custom-build')]),
        withTargets('R-004', 'verify', [t('app-custom', 'unknown')], { wantsApi: true }),
        req('R-005', 'full'),
      ],
    })
    open('/summary')
    const h = screen.getByRole('heading', { name: /tool ของ Buzzebees ที่ต้องใช้/ })
    expect(h).toBeInTheDocument()
    const app = screen.getByRole('region', { name: /Solution App project — Custom/ })
    expect(within(app).getByText('User Management')).toBeInTheDocument()
    expect(within(app).getByText(/พัฒนาใหม่ \(ไม่ใช่ tool ของ Buzzebees\)/)).toBeInTheDocument()
    expect(within(app).getByText('ยังไม่ระบุ tool')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Solution CRM\+ module/ })).toBeInTheDocument()
    expect(screen.getByText(/พัฒนาใหม่ 1 ข้อ/)).toBeInTheDocument()
    expect(screen.getByText(/ลูกค้าขอ API 1 ข้อ/)).toBeInTheDocument()
    expect(screen.getByText(/1 ข้อยังไม่ได้จัด solution/)).toBeInTheDocument()
  })

  it('leaves the section out for results saved before solutions existed', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full')] })
    open('/summary')
    expect(screen.getByRole('link', { name: 'สรุป' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('heading', { name: /tool ของ Buzzebees ที่ต้องใช้/ })).not.toBeInTheDocument()
  })
})

describe('basketball mode for the file step', () => {
  beforeEach(() => useAssessmentStore.setState({ files: [], error: null }))

  it('is off by default, switches on, and is remembered', async () => {
    const user = userEvent.setup()
    open('/')
    expect(screen.getByRole('switch', { name: /Boredom buster mode/ })).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('group', { name: /สนามบาส/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: /Boredom buster mode/ }))
    expect(await screen.findByRole('group', { name: /สนามบาส/ })).toBeInTheDocument()
    expect(localStorage.getItem('tor-scouter-hoop')).toBe('1')
    expect(screen.queryByText('ลาก TOR มาวางตรงนี้')).not.toBeInTheDocument() // the court takes the drop zone's place
  })

  it('a file becomes the ball, and "ใส่ไฟล์เลย" adds it without playing', async () => {
    localStorage.setItem('tor-scouter-hoop', '1')
    const user = userEvent.setup()
    open('/')
    const input = await screen.findByLabelText('เลือกไฟล์ TOR')
    await user.upload(input, [new File(['a'], 'tor.pdf', { type: 'application/pdf' })])
    expect(screen.getByText(/tor\.pdf พร้อมแล้ว/)).toBeInTheDocument()
    expect(useAssessmentStore.getState().files).toHaveLength(0) // nothing is added until the ball goes in
    await user.click(screen.getByRole('button', { name: 'ใส่ไฟล์เลย' }))
    expect(useAssessmentStore.getState().files.map((f) => f.name)).toEqual(['tor.pdf'])
  })

  it('cannot be switched while a run is going', () => {
    useAssessmentStore.setState({ running: true })
    open('/')
    expect(screen.getByRole('switch', { name: /Boredom buster mode/ })).toBeDisabled()
    useAssessmentStore.setState({ running: false })
  })
})

describe('landing animation', () => {
  it('shows the logo on load, fades after a moment, and any click skips it', async () => {
    vi.useFakeTimers()
    const { unmount } = render(<Splash />)
    expect(screen.getByTestId('splash')).toBeInTheDocument()
    expect(screen.getByTestId('splash')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('splash').textContent).toBe('') // the logo alone, no name
    act(() => { vi.advanceTimersByTime(2100) })
    expect(screen.getByTestId('splash').style.opacity).toBe('0') // fading
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
    unmount()

    render(<Splash />)
    fireEvent.pointerDown(screen.getByTestId('splash'))
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('boredom-buster mode with many files', () => {
  it('shoots one file at a time: the first is the ball, the rest wait on the floor', async () => {
    localStorage.setItem('tor-scouter-hoop', '1')
    useAssessmentStore.setState({ files: [], error: null })
    const user = userEvent.setup()
    open('/')
    const input = await screen.findByLabelText('เลือกไฟล์ TOR')
    const many = ['a.pdf', 'b.docx', 'c.xlsx', 'd.png', 'e.jpg', 'f.pdf', 'g.pdf', 'h.pdf'].map((n) => new File([n], n))
    await user.upload(input, many)
    const court = screen.getByRole('group', { name: /สนามบาส/ })
    expect(court.querySelectorAll('text').length).toBeGreaterThanOrEqual(6) // the ball's label and five waiting files
    expect(within(court).getByText('+2')).toBeInTheDocument() // 7 waiting, 5 drawn
    expect(screen.getByText(/a\.pdf พร้อมแล้ว/)).toBeInTheDocument()
    expect(screen.getByText(/เหลืออีก 7 ไฟล์ ยิงทีละไฟล์/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ใส่ไฟล์เลย' }))
    expect(useAssessmentStore.getState().files.map((f) => f.name)).toEqual(['a.pdf']) // only the one in hand
    expect(screen.getByText(/b\.docx พร้อมแล้ว/)).toBeInTheDocument()
    expect(within(court).getByText('+1')).toBeInTheDocument()
  })
})

describe('DeepSeek in the app', () => {
  it('is a provider choice with a note that it reads text only', async () => {
    const user = userEvent.setup()
    open('/ai-settings')
    await user.click(screen.getByRole('radio', { name: 'DeepSeek' }))
    expect(screen.getByText(/DeepSeek อ่านได้เฉพาะข้อความ/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('deepseek-chat')
  })

  it('BytePlus ModelArk is a choice too: it reads images, not PDF', async () => {
    const user = userEvent.setup()
    open('/ai-settings')
    await user.click(screen.getByRole('radio', { name: 'BytePlus ModelArk' }))
    expect(screen.getByText(/BytePlus ModelArk อ่านข้อความและรูปภาพได้/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('deepseek-v4-1-flash-261017')
  })

  it('lets an image through with BytePlus, and still holds a PDF', () => {
    useAssessmentStore.setState({ provider: 'byteplus', model: 'deepseek-v4-1-flash-261017', apiKey: 'bp-key-123456789', files: [new File(['x'], 'TOR B2S.png')], running: false, step: -1, error: null })
    const { unmount } = open('/')
    expect(screen.getByRole('button', { name: 'แยก Requirement' })).toBeEnabled()
    unmount()
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.pdf')] })
    open('/')
    expect(screen.getByText('BytePlus ModelArk อ่าน tor.pdf ไม่ได้ ใช้ DOCX, XLSX, CSV, TXT หรือรูปภาพ หรือเปลี่ยน AI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'แยก Requirement' })).toBeDisabled()
    useAssessmentStore.setState({ files: [], provider: 'anthropic', apiKey: '' })
  })

  it('holds the run when a PDF is chosen with DeepSeek, and lets a DOCX through', () => {
    useAssessmentStore.setState({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-ds-123456789', files: [new File(['x'], 'tor.pdf')], running: false, step: -1, error: null })
    const { unmount } = open('/')
    expect(screen.getByText(/DeepSeek อ่าน tor\.pdf ไม่ได้/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'แยก Requirement' })).toBeDisabled()
    unmount()
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.docx')] })
    open('/')
    expect(screen.getByRole('button', { name: 'แยก Requirement' })).toBeEnabled()
    useAssessmentStore.setState({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: '', files: [] })
  })
})

describe('one menu for the TOR pages', () => {
  it('lights "TOR ทั้งหมด" on every page of the TOR flow', () => {
    for (const path of ['/history', '/review', '/summary', '/matrix']) {
      const { unmount } = open(path)
      expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'TOR ทั้งหมด' })).toHaveAttribute('aria-current', 'page')
      unmount()
    }
  })

  it('a result has a way back to the list and two tabs, with the number of requirements on the second', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'none')], customer: 'ACME' })
    for (const path of ['/summary', '/matrix']) {
      const { unmount } = open(path)
      expect(screen.getByRole('main').querySelector('a[href="/history"]')).toHaveTextContent('TOR ทั้งหมด') // the way back
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ACME')
      const tabs = within(screen.getByRole('navigation', { name: 'TOR' })).getAllByRole('link')
      expect(tabs.map((t) => t.textContent)).toEqual(['สรุป', 'รายข้อ2'])
      expect(tabs.filter((t) => t.getAttribute('aria-current') === 'page')).toHaveLength(1)
      unmount()
    }
  })

  it('leaves the tabs out of the list, the review and the other pages', () => {
    for (const path of ['/history', '/review', '/knowledge-base']) {
      const { unmount } = open(path)
      expect(screen.queryByRole('navigation', { name: 'TOR' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('the old dashboard, gaps and questions addresses lead to the summary', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full')] })
    for (const path of ['/dashboard', '/gaps', '/questions']) {
      const { unmount } = open(path)
      expect(screen.getByRole('link', { name: 'สรุป' })).toHaveAttribute('aria-current', 'page')
      unmount()
    }
  })

  it('the summary page holds the verdict, the matches, what to do next, the categories, the contract terms and the open questions', () => {
    useAssessmentStore.setState({
      result: [{ ...req('R-001', 'full'), evidence: 'KB › Member › Registration' }, { ...req('R-002', 'custom'), gap: 'ไม่มีตัวกรองสาขา' }, { ...req('R-003', 'verify'), q: 'หน่วงได้กี่นาที' }],
      terms: [{ id: 'R-004', text: 'ส่งมอบใน 120 วัน', ref: 'ข้อ 6.2' }],
      coverage: null,
    })
    open('/summary')
    for (const h of ['ตรงกับ product ที่เรามี', 'ต้องตัดสินใจ', 'ถามลูกค้า', 'ต้องพัฒนาหรือเชื่อมระบบ', 'รายหมวด', 'เงื่อนไขสัญญาและคุณสมบัติผู้ยื่น', 'Open questions for customer']) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
    expect(screen.getByText('Registration')).toBeInTheDocument() // the feature of ours it maps to
    expect(screen.getByText('ต้องพัฒนาเพิ่ม: ไม่มีตัวกรองสาขา')).toBeInTheDocument()
    expect(screen.getByText('หน่วงได้กี่นาที')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /ส่งมอบใน 120 วัน/ }))
    expect(useAssessmentStore.getState().terms[0].ok).toBe(true)
    expect(screen.getByText('ตรวจแล้ว 1 จาก 1 ข้อ')).toBeInTheDocument()
    useAssessmentStore.setState({ terms: [] })
  })

  it('the summary draws one bar per requirement in four groups, and a bar opens that requirement', async () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'config'), { ...req('R-003', 'none'), rec: 'เสนอเป็น Phase 2' }, req('R-004', 'verify')], customer: 'ACME' })
    const user = userEvent.setup()
    open('/summary')
    const strip = within(screen.getByRole('region', { name: 'requirement ทุกข้อ แยกตามผล' }))
    expect(strip.getAllByRole('button', { name: /^R-00\d requirement/ })).toHaveLength(4)
    await user.click(strip.getByRole('button', { name: 'R-003 requirement R-003, ไม่รองรับ, ข้อบังคับ' }))
    const drawer = within(screen.getByRole('dialog', { name: 'requirement R-003' }))
    expect(drawer.getByText('เสนอเป็น Phase 2')).toBeInTheDocument()
    expect(drawer.getByText('ข้อบังคับ')).toBeInTheDocument()
  })

  it('the summary starts with the share supported out of what could be judged, and the verdict', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'none'), req('R-003', 'verify')], customer: 'ACME' })
    open('/summary')
    expect(screen.getByLabelText('รองรับได้ 50%')).toBeInTheDocument()
    expect(screen.getByText('รองรับได้ 1 จาก 2 ข้อที่ประเมินได้')).toBeInTheDocument()
    expect(screen.getAllByText('เสี่ยงสูง').length).toBeGreaterThan(0)
    expect(screen.getByText('มีข้อบังคับ 1 ข้อที่ยังไม่รองรับ ควรคุยขอบเขตกับลูกค้าก่อนตัดสินใจยื่น')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument() // mandatory supported, of those that could be judged
  })
})

describe('verdict rules', () => {
  it('ยื่นได้ when every mandatory one is supported and 85% or more; เสี่ยงสูง from 3 mandatory gaps or under 60%', async () => {
    const { scoreCounts } = await import('@/lib/verdict')
    expect(scoreCounts({ full: 17, none: 3, 'o:none': 3 })).toMatchObject({ cov: 85, mandNo: 0, verdict: 'GO' })
    expect(scoreCounts({ full: 17, none: 3, 'o:none': 2 })).toMatchObject({ mandNo: 1, verdict: 'COND' })
    expect(scoreCounts({ full: 97, none: 3 })).toMatchObject({ cov: 97, mandNo: 3, verdict: 'HIGH' })
    expect(scoreCounts({ full: 5, config: 0, none: 4, 'o:none': 4 })).toMatchObject({ cov: 56, verdict: 'HIGH' })
    expect(scoreCounts({ full: 8, custom: 1, verify: 10 })).toMatchObject({ evaluable: 9, cov: 100, ready: 89, verdict: 'GO' }) // "ต้องตรวจสอบ" is left out of the share
    expect(scoreCounts({})).toMatchObject({ total: 0, cov: 0 })
  })
})

describe('a TOR is saved to the list from its review on', () => {
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response
  const calls: { url: string; method: string; body?: any }[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  afterEach(() => { vi.unstubAllGlobals(); useAssessmentStore.setState({ mode: 'unknown', user: null, owner: null, historyId: null, files: [], review: null, result: null, terms: [], scope: '' }) })

  it('posts the review, puts each edit, then puts the judged result to the same entry with the contract terms apart', async () => {
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ url, method, body })
      if (url === '/api/extract') return json({ scope: 'ระบบสมาชิก', requirements: [{ id: 'R-001', module: 'Mission', text: 'ภารกิจ', pri: 'O', ref: 'ข้อ 2.9' }, { id: 'R-002', module: 'เงื่อนไขสัญญาและผู้ยื่น', text: 'ส่งมอบ 120 วัน', pri: 'M', ref: 'ข้อ 6.2' }] })
      if (url === '/api/classify') return json({ results: body.requirements.map((r: { id: string; module: string; text: string }) => ({ id: r.id, module: r.module, text: r.text, targets: [{ solution: 'crm-plus', service: 'point' }], wantsApi: false })) })
      if (url === '/api/judge') return json({ results: body.requirements.map((r: { id: string }) => ({ ...req(r.id, 'full'), module: 'Mission' })) })
      if (url === '/api/history' && method === 'POST') return json({ id: 'h-9' })
      if (url.startsWith('/api/history')) return json({ ok: true })
      return json({ topics: [] })
    }))
    useAssessmentStore.setState({ mode: 'account', user: 'ann', owner: 'ann', apiKey: 'k-123456789', files: [new File(['x'], 'tor.txt')], customer: 'ACME' })
    await useAssessmentStore.getState().runReal()
    await waitFor(() => expect(useAssessmentStore.getState().historyId).toBe('h-9'))
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/history')!
    expect(post.body.data).toMatchObject({ scope: 'ระบบสมาชิก', review: [{ id: 'R-001', pri: 'O', ref: 'ข้อ 2.9', targets: [{ solution: 'crm-plus', service: 'point' }] }, { id: 'R-002' }], result: [] })

    useAssessmentStore.getState().editReq('R-001', { text: 'ภารกิจสะสมแสตมป์' })
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.body?.data.review?.[0].text === 'ภารกิจสะสมแสตมป์')).toBe(true), { timeout: 3000 })

    await useAssessmentStore.getState().confirmReview()
    const judgeCalls = calls.filter((c) => c.url === '/api/judge')
    expect(judgeCalls.flatMap((c) => c.body.requirements.map((r: { id: string }) => r.id))).toEqual(['R-001']) // the contract term is not judged
    const s = useAssessmentStore.getState()
    expect(s.result).toEqual([expect.objectContaining({ id: 'R-001', pri: 'O', ref: 'ข้อ 2.9' })]) // priority and clause come back from the review
    expect(s.terms).toEqual([{ id: 'R-002', text: 'ส่งมอบ 120 วัน', ref: 'ข้อ 6.2', ok: undefined }])
    expect(s.confirmed?.by).toBe('ann')
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/history?id=h-9' && c.body.data.review === null && c.body.data.result.length === 1)).toBe(true))
    expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/history')).toHaveLength(1) // one entry, all the way
  })

  it('clearing a saved review deletes it from the list too', async () => {
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => { calls.push({ url, method: init.method ?? 'GET' }); return json({ ok: true }) }))
    useAssessmentStore.setState({ mode: 'account', user: 'ann', historyId: 'h-3', review: [{ id: 'R-001', module: 'Mission', text: 't' }] })
    useAssessmentStore.getState().clearReview()
    expect(calls).toContainEqual({ url: '/api/history?id=h-3', method: 'DELETE' })
    expect(useAssessmentStore.getState()).toMatchObject({ review: null, historyId: null })
  })
})

describe('browser state saved before "zone" was renamed "solution"', () => {
  it('reads old targets with the new name', async () => {
    localStorage.setItem('tor-scouter', JSON.stringify({ version: 0, state: { result: [{ ...req('R-001', 'full'), targets: [{ zone: 'crm-plus', service: 'point' }] }], review: [{ id: 'R-002', module: 'M', text: 't', targets: [{ zone: 'app-custom', service: 'unknown' }] }] } }))
    await useAssessmentStore.persist.rehydrate()
    expect(useAssessmentStore.getState().result?.[0].targets).toEqual([{ solution: 'crm-plus', service: 'point' }])
    expect(useAssessmentStore.getState().review?.[0].targets).toEqual([{ solution: 'app-custom', service: 'unknown' }])
  })
})

describe('motion on the TOR pages, as in the mockup', () => {
  it('the bars grow in one wave the first time a result is shown, not the next time', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'none'), req('R-003', 'verify')], historyId: 'motion-1' })
    const first = open('/summary')
    const strip = screen.getByRole('region', { name: 'requirement ทุกข้อ แยกตามผล' })
    const rows = [...strip.querySelectorAll('.bars-grow')]
    expect(rows.length).toBeGreaterThan(0)
    expect([...strip.querySelectorAll('button')].map((b) => (b as HTMLElement).style.getPropertyValue('--i'))).toEqual(['0', '1', '2']) // one wave across the groups
    first.unmount()
    open('/summary')
    expect(screen.getByRole('region', { name: 'requirement ทุกข้อ แยกตามผล' }).querySelector('.bars-grow')).toBeNull()
    useAssessmentStore.setState({ historyId: null })
  })

  it('pointing at a bar shows its requirement and status in a tooltip, and leaving hides it', async () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), { ...req('R-002', 'none'), pri: 'O' }] })
    const user = userEvent.setup()
    open('/summary')
    const strip = within(screen.getByRole('region', { name: 'requirement ทุกข้อ แยกตามผล' }))
    const bar = strip.getByRole('button', { name: /^R-002 / })
    expect(bar).not.toHaveAttribute('title') // the mockup's tooltip, not the browser's
    await user.hover(bar)
    const tip = document.body.querySelector('[data-bar-tip]') as HTMLElement
    expect(tip).toHaveTextContent('R-002 requirement R-002')
    expect(tip).toHaveTextContent('ไม่รองรับ, ไม่บังคับ')
    await user.unhover(bar)
    expect(document.body.querySelector('[data-bar-tip]')).toBeNull()
    act(() => bar.focus()) // the keyboard gets it too
    expect(document.body.querySelector('[data-bar-tip]')).toHaveTextContent('R-002')
  })

  it('the detail slides in over a fading backdrop', async () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full')] })
    const user = userEvent.setup()
    open('/matrix')
    await user.click(screen.getByRole('button', { name: /^R-001 / }))
    expect(screen.getByRole('dialog').className).toContain('slide-in')
  })

  it('comparing with the KB shows the steps over the review page', () => {
    useAssessmentStore.setState({ review: [{ id: 'R-001', module: 'Mission', text: 't', targets: [{ solution: 'crm-plus', service: 'point' }] }], running: true, step: 3, detail: 'ประเมินแล้ว 1/2 ชุด' })
    open('/review')
    const proc = within(screen.getByRole('dialog', { name: 'กำลังเทียบกับ Knowledge Base' }))
    expect(proc.getByText('ตัดสินผลทีละข้อ (1 ข้อ)')).toHaveClass('font-medium') // the step running now
    expect(proc.getByRole('status')).toHaveTextContent('ประเมินแล้ว 1/2 ชุด')
    useAssessmentStore.setState({ running: false, step: -1, detail: '', review: null })
  })
})

describe('Feature Scouter page', () => {
  const g = (reqId: string, tor: string, extra: object = {}) => ({ assessmentId: tor, reqId, module: 'Dashboard & Report', text: `text ${reqId}`, gap: `gap ${reqId}`, s: 'custom', mandatory: true, confirmed: true, tor: `TOR ${tor}`, customer: `C-${tor}`, industry: 'Retail', deal: 1_000_000, due: '2026-12-01', itemId: 'SC-0001', dealResult: 'open', lostBecause: false, createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '', ...extra })
  const item = (id: string, title: string, extra: object = {}) => ({ id, title, need: `need ${id}`, type: 'ENHANCEMENT', module: 'Dashboard & Report', status: 'new', editedBy: 'AI', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '', ...extra })
  const calls: { url: string; method: string; body?: unknown }[] = []
  const serve = (data: object) => {
    calls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      calls.push({ url, method, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined })
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as Response
      if (url === '/api/auth') return ok({ mode: 'account', user: { username: 'ann' } })
      if (url === '/api/scouter' && method === 'GET') return ok(data)
      return ok({ grouped: 0, created: 0, left: 0 })
    }))
    useAssessmentStore.setState({ mode: 'account', user: 'ann', owner: 'ann' })
  }
  afterEach(() => { vi.unstubAllGlobals(); useAssessmentStore.setState({ mode: 'unknown', user: null, owner: null }) })

  it('counts only confirmed gaps, each TOR once for its deal', async () => {
    const { needStats } = await import('@/lib/scouter')
    const s = needStats([g('R-1', 'a'), g('R-2', 'a', { mandatory: false }), g('R-1', 'b', { mandatory: false, lostBecause: true, deal: 500_000 }), g('R-3', 'c', { confirmed: false })] as never)
    expect(s).toMatchObject({ tors: 2, customers: 2, mand: 1, deal: 1_500_000, lost: 500_000, pending: 1 })
  })

  it('is in the menu only with accounts', () => {
    const { unmount } = open('/')
    expect(within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', { name: 'Feature Scouter' })).not.toBeInTheDocument()
    unmount()
    useAssessmentStore.setState({ mode: 'account', user: 'ann', owner: 'ann' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ mode: 'account', user: { username: 'ann' } }) }) as Response))
    open('/')
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Feature Scouter' })).toHaveAttribute('href', '/scouter')
  })

  it('ranks needs by TORs that asked, from confirmed gaps; shows what waits; a need opens with every TOR that asked', async () => {
    const user = userEvent.setup()
    serve({
      items: [item('SC-0001', 'Branch filter'), item('SC-0002', 'Family account', { type: 'NEW_FEATURE', status: 'planned' }), item('SC-0003', 'Only pending')],
      gaps: [g('R-1', 'a'), g('R-1', 'b', { itemId: 'SC-0002' }), g('R-2', 'c', { itemId: 'SC-0002' }), g('R-9', 'd', { itemId: 'SC-0003', confirmed: false })],
      admin: false,
    })
    open('/scouter')
    const table = within(await screen.findByRole('table', { name: 'ความต้องการ' }))
    const rows = table.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].querySelector('span')!.textContent)).toEqual(['Family account', 'Branch filter']) // 2 TORs before 1; nothing confirmed: not listed
    expect(rows[0]).toHaveTextContent('อยู่ใน roadmap')
    expect(table.queryByRole('combobox')).not.toBeInTheDocument() // not an admin: the status is text
    expect(screen.getByText(/รอ PM ยืนยันอีก 1 ข้อ/)).toBeInTheDocument()
    const summary = within(document.querySelector('dl[aria-label="ภาพรวม"]') as HTMLElement)
    const stats = (label: string) => summary.getByText(label).parentElement!.querySelector('dd')!.textContent
    expect([stats('ความต้องการ'), stats('ครั้งที่ถูกขอใน TOR'), stats('ลูกค้าที่ขอ')]).toEqual(['2', '3', '3'])
    await user.click(screen.getByRole('button', { name: /^Family account/ }))
    const drawer = within(screen.getByRole('dialog', { name: 'Family account' }))
    expect(drawer.getByText('C-b')).toBeInTheDocument()
    expect(drawer.getByText('C-c')).toBeInTheDocument()
    expect(drawer.queryByRole('button', { name: 'แก้ไข' })).not.toBeInTheDocument()
  })

  it('groups the gaps that are not grouped yet when it opens, once', async () => {
    serve({ items: [], gaps: [g('R-1', 'a', { itemId: null })], admin: false })
    open('/scouter')
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/scouter?action=group')).toHaveLength(1))
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/scouter' && c.method === 'GET').length).toBeGreaterThanOrEqual(2)) // reloaded after grouping
    expect(calls.filter((c) => c.url === '/api/scouter?action=group')).toHaveLength(1)
  })

  it('an admin sets the product status, edits a need and merges it into another', async () => {
    const user = userEvent.setup()
    serve({ items: [item('SC-0001', 'Branch filter'), item('SC-0002', 'Branch report')], gaps: [g('R-1', 'a'), g('R-2', 'b', { itemId: 'SC-0002' })], admin: true })
    open('/scouter')
    await user.selectOptions(await screen.findByLabelText('สถานะฝั่ง Product ของ Branch filter'), 'in_dev')
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ id: 'SC-0001', status: 'in_dev' })
    await user.click(screen.getByRole('button', { name: /^Branch filter/ }))
    const drawer = within(screen.getByRole('dialog', { name: 'Branch filter' }))
    await user.click(drawer.getByRole('button', { name: 'แก้ไข' }))
    await user.clear(drawer.getByLabelText('ชื่อ'))
    await user.type(drawer.getByLabelText('ชื่อ'), 'Dashboard by branch')
    await user.click(drawer.getByRole('button', { name: 'บันทึก' }))
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)!.body).toMatchObject({ id: 'SC-0001', title: 'Dashboard by branch' })
    await user.selectOptions(drawer.getByLabelText('รวมเข้ากับ'), 'SC-0002')
    await user.click(drawer.getByRole('button', { name: 'รวมเข้าด้วยกัน' }))
    expect(calls.find((c) => c.url === '/api/scouter?action=merge')!.body).toEqual({ from: 'SC-0001', into: 'SC-0002' })
  })

  it('without accounts it says the Scouter needs them', () => {
    open('/scouter')
    expect(screen.getByText('ใช้ได้เมื่อเปิดระบบบัญชี')).toBeInTheDocument()
  })
})

describe('deal result on the summary page', () => {
  it('records how the bid ended and, when lost, the gaps it was lost for; anything but lost clears them', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ result: [req('R-001', 'full'), { ...req('R-002', 'none'), gap: 'ไม่มีบัญชีครอบครัว' }, req('R-003', 'integ')] })
    open('/summary')
    const section = within(screen.getByRole('region', { name: 'ผลดีล' }))
    expect(section.getByRole('button', { name: 'ยังไม่ปิด' })).toHaveAttribute('aria-pressed', 'true')
    expect(section.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(section.getByRole('button', { name: 'แพ้' }))
    expect(section.getAllByRole('checkbox')).toHaveLength(2) // only the gaps: R-001 is supported
    await user.click(section.getByRole('checkbox', { name: /R-002/ }))
    expect(useAssessmentStore.getState().deal).toEqual({ result: 'lost', lostBecause: ['R-002'] })
    await user.click(section.getByRole('button', { name: 'ชนะ' }))
    expect(useAssessmentStore.getState().deal).toEqual({ result: 'won', lostBecause: [] })
    useAssessmentStore.setState({ deal: { result: 'open', lostBecause: [] } })
  })
})
