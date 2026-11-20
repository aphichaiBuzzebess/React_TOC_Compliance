import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import type { Req } from '@/lib/types'
import { pageSlices } from '@/lib/exportPdf'
import { Logo, logoPath, spreadFor } from '@/components/Logo'

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
  useAssessmentStore.setState({ result: null, review: null, coverage: null, selId: null, valid: {}, apiKey: '', accessCode: '' })
})

describe('no mock data', () => {
  it.each(['/dashboard', '/matrix', '/gaps', '/questions', '/summary'])('%s shows an empty state until a TOR is assessed', (path) => {
    open(path)
    expect(screen.getByText(/ยังไม่มีผลประเมิน/)).toBeInTheDocument()
    expect(screen.getByText('ยังไม่มี TOR')).toBeInTheDocument()
  })

  it('shows real results once there are some', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'none')], selId: 'R-001' })
    open('/matrix')
    expect(screen.getByText('requirement R-002')).toBeInTheDocument()
    expect(screen.getByText('2 requirements')).toBeInTheDocument()
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
      if (url === '/api/classify') return ok({ results: (JSON.parse(init.body as string).requirements as typeof reqs).map((r) => ({ ...r, targets: [{ zone: 'app-custom', service: 'user-management' }], wantsApi: false })) })
      if (url === '/api/judge') return ok({ results: (JSON.parse(init.body as string).requirements as typeof reqs).map((r) => req(r.id, 'full')) })
      return questionsOk ? ok({ topics: [{ function: 'Point', coverage: 'covered', reqIds: [], open: [] }] }) : ({ ok: false, status: 500, json: async () => ({ error: 'quota exceeded' }) } as Response)
    }))
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.pdf')], apiKey: 'k-123456789', running: false, step: -1, error: null })
    await useAssessmentStore.getState().runReal()
    await useAssessmentStore.getState().confirmReview()
    return useAssessmentStore.getState()
  }

  it('stops after classify so the BA can confirm zones, and judges nothing yet', async () => {
    const judged = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/extract') return ok({ requirements: reqs })
      if (url === '/api/classify') return ok({ results: (JSON.parse(init.body as string).requirements as typeof reqs).map((r) => ({ ...r, targets: [{ zone: 'crm-plus', service: 'campaign-management' }], wantsApi: r.id === 'R-001' })) })
      judged(url)
      return ok({ results: [], topics: [] })
    }))
    useAssessmentStore.setState({ files: [new File(['x'], 'tor.pdf')], apiKey: 'k-123456789', running: false, step: -1, error: null })
    await useAssessmentStore.getState().runReal()
    const s = useAssessmentStore.getState()
    expect(s.review).toHaveLength(12)
    expect(s.review?.[0]).toMatchObject({ targets: [{ zone: 'crm-plus', service: 'campaign-management' }], wantsApi: true })
    expect(s.result).toBeNull()
    expect(s.running).toBe(false)
    expect(s.step).toBe(2)
    expect(judged).not.toHaveBeenCalled()
  })

  it('sends the edited zones and the API flag to the judge, then clears the review', async () => {
    const sent: { id: string; targets?: unknown; wantsApi?: boolean }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/judge') { const rs = JSON.parse(init.body as string).requirements as typeof sent; sent.push(...rs); return ok({ results: rs.map((r) => req(r.id, 'full')) }) }
      return ok({ topics: [] })
    }))
    useAssessmentStore.setState({ apiKey: 'k-123456789', review: [{ id: 'R-1', module: 'M', text: 't', targets: [{ zone: 'unknown', service: 'unknown' }] }], result: null })
    useAssessmentStore.getState().setTargets('R-1', [{ zone: 'app-custom', service: 'point' }, { zone: 'crm-plus', service: 'report-analytic' }])
    useAssessmentStore.getState().setWantsApi('R-1', true)
    await useAssessmentStore.getState().confirmReview()
    expect(sent[0]).toMatchObject({ id: 'R-1', wantsApi: true, targets: [{ zone: 'app-custom', service: 'point' }, { zone: 'crm-plus', service: 'report-analytic' }] })
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
    const files = ['src/components/ui.tsx', 'src/components/AppShell.tsx', 'src/pages/Dashboard.tsx', 'src/pages/Matrix.tsx', 'src/pages/Gaps.tsx', 'src/pages/Questions.tsx', 'src/pages/Summary.tsx', 'src/pages/KnowledgeBase.tsx', 'src/pages/AiSettings.tsx']
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
    ['/dashboard', /Coverage dashboard/],
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
    const hint = screen.getByText('ใส่ AI key และเลือกไฟล์ TOR ก่อน')
    expect(screen.getByRole('button', { name: /Run assessment/ })).toHaveAttribute('aria-describedby', hint.id)
  })

  it('gives data tables a caption and column scopes, and marks the selected requirement', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'full'), req('R-002', 'none')], selId: 'R-002' })
    open('/matrix')
    expect(screen.getByRole('table', { name: 'Requirements and their compliance status' })).toBeInTheDocument()
    for (const th of screen.getAllByRole('columnheader')) expect(th).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('button', { name: 'R-002' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'R-001' })).not.toHaveAttribute('aria-current')
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
  const panel = () => within(screen.getByRole('complementary', { name: 'Requirement detail' }))

  beforeEach(() => {
    useAssessmentStore.setState({ result: data, selId: 'R-001', filter: 'all', query: '', valid: {} })
  })

  it('shows the detail of the row you picked, next to it', async () => {
    const user = userEvent.setup()
    open('/matrix')
    expect(panel().getByText('reason for R-001')).toBeInTheDocument()
    await user.click(screen.getByText('ส่งคะแนนเข้า SAP')) // click anywhere on the row, not just the ID
    expect(panel().getByText('reason for R-003')).toBeInTheDocument()
    expect(panel().getByText('evidence for R-003')).toBeInTheDocument()
    expect(panel().getByText('rec for R-003')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'R-003' })).toHaveAttribute('aria-current', 'true')
  })

  it('steps with next/previous inside the filtered rows and shows the position', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.selectOptions(screen.getByLabelText('Module'), 'Point')
    await user.click(screen.getByRole('button', { name: 'R-003' }))
    expect(panel().getByText('1 / 2')).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Previous requirement' })).toBeDisabled()
    await user.click(panel().getByRole('button', { name: 'Next requirement' }))
    expect(panel().getByText('reason for R-004')).toBeInTheDocument()
    expect(panel().getByText('2 / 2')).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Next requirement' })).toBeDisabled()
  })

  it('filters by module and status, and clears the filters', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.selectOptions(screen.getByLabelText('Module'), 'Member')
    expect(screen.queryByRole('button', { name: 'R-003' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Customization Required/ }))
    expect(screen.getByRole('button', { name: 'R-002' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'R-001' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'ล้างตัวกรอง' })[0])
    expect(screen.getByRole('button', { name: 'R-004' })).toBeInTheDocument()
  })

  it('confirming records the result and moves on to the next requirement', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.click(panel().getByRole('button', { name: /Confirm result/ }))
    expect(useAssessmentStore.getState().valid['R-001']).toBe('ok')
    expect(useAssessmentStore.getState().selId).toBe('R-002')
    expect(panel().getByText('reason for R-002')).toBeInTheDocument()
    await user.click(panel().getByRole('button', { name: 'Flag for review' }))
    expect(useAssessmentStore.getState().valid['R-002']).toBe('flag')
    expect(screen.getByText(/ยืนยันแล้ว 1 · ติดธง 1 · ยังไม่ตรวจ 2/)).toBeInTheDocument()
  })

  it('moves the selection with the arrow keys', async () => {
    const user = userEvent.setup()
    open('/matrix')
    screen.getByRole('button', { name: 'R-001' }).focus()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(useAssessmentStore.getState().selId).toBe('R-003')
    await user.keyboard('{ArrowUp}')
    expect(useAssessmentStore.getState().selId).toBe('R-002')
  })

  it('keeps long unbroken text (URLs) from stretching the table', () => {
    useAssessmentStore.setState({ result: [mk('R-001', 'Member', 'full', 'ดูที่ https://www.example.com/th/member/history')] })
    open('/matrix')
    for (const el of screen.getAllByText(/https:\/\/www\.example\.com/)) expect(el.className).toContain('wrap-anywhere')
  })
})

describe('home: task first', () => {
  const stepItems = () => [...screen.getByRole('list', { name: 'ขั้นตอน' }).children] // top-level steps only, not the file list inside step 2

  beforeEach(() => {
    useAssessmentStore.setState({ result: null, coverage: null, files: [], apiKey: '', running: false, step: -1, error: null, detail: '', startedAt: null })
  })

  it('tells a first-time user what is missing, in order, and marks the current step', () => {
    open('/')
    const items = stepItems()
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveAttribute('aria-current', 'step') // key comes first
    expect(items[0]).toHaveTextContent('ใส่ AI key')
    expect(items[2]).toHaveTextContent('ใส่ AI key และเลือกไฟล์ TOR ก่อน')
  })

  it('ticks steps off as the key and file arrive, and then Run is ready', () => {
    useAssessmentStore.setState({ apiKey: 'k-123456789', files: [new File(['x'], 'bangchak-tor.pdf')] })
    open('/')
    const items = stepItems()
    expect(items[0]).toHaveTextContent('✓')
    expect(items[1]).toHaveTextContent('bangchak-tor.pdf')
    expect(items[2]).toHaveAttribute('aria-current', 'step')
    expect(items[2]).toHaveTextContent('พร้อมแล้ว')
    expect(screen.getByRole('button', { name: /Run assessment/ })).toBeEnabled()
  })

  it('attaches several files, including images, lets you remove one, and skips duplicates', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ files: [], error: null })
    open('/')
    const input = document.getElementById('torFile') as HTMLInputElement
    expect(input.multiple).toBe(true)
    expect(input.accept).toContain('.png')
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
    useAssessmentStore.setState({ files: [], error: null })
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'huge.pdf')
    useAssessmentStore.getState().addFiles([big])
    expect(useAssessmentStore.getState().files).toHaveLength(0)
    expect(useAssessmentStore.getState().error).toContain('huge.pdf')
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
    useAssessmentStore.setState({ files: [new File(['a'], 'a.pdf'), new File(['b'], 'b.png')], apiKey: 'k-123456789', running: false, step: -1, error: null })
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
    useAssessmentStore.setState({ apiKey: '', files: [new File(['x'], 'tor.pdf')], serverDefault: { provider: 'gemini', model: 'gemini-3.8-flash' }, running: false, step: -1, error: null })
    open('/')
    expect(screen.getByRole('button', { name: /Run assessment/ })).toBeEnabled()
    expect(screen.getByText(/ค่าจากเซิร์ฟเวอร์/)).toBeInTheDocument()
    await useAssessmentStore.getState().runReal()
    useAssessmentStore.setState({ serverDefault: { provider: 'gemini', model: 'gemini-3.8-flash' } }) // the mounted app's status probe got {} from this fake fetch and cleared it
    await useAssessmentStore.getState().confirmReview()
    expect(Object.keys(headers).filter((h) => h.startsWith('x-llm'))).toEqual([])
    expect(useAssessmentStore.getState().result).toHaveLength(1)
    useAssessmentStore.setState({ serverDefault: null })
    vi.unstubAllGlobals()
  })

  it('puts the upload before the progress band, so the work is not buried under explanation', () => {
    open('/')
    const upload = document.getElementById('torFile')!
    const band = document.getElementById('workflow')!
    expect(upload.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // the long explanation is collapsed by default
    expect(document.querySelector('details')).not.toHaveAttribute('open')
  })

  it('shows returning users their last result with shortcuts, and hides it while a run is in progress', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'verify'), req('R-002', 'integ')] })
    open('/')
    expect(screen.getByText('ผลประเมินล่าสุด')).toBeInTheDocument()
    const row = within(screen.getByText('ผลประเมินล่าสุด').parentElement!) // the top bar has links with the same names
    expect(row.getByRole('link', { name: 'Matrix' })).toHaveAttribute('href', '/matrix')
    expect(row.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('puts the last result after the card in reading order, so the task comes first', () => {
    useAssessmentStore.setState({ result: [req('R-001', 'verify')] })
    open('/')
    const card = screen.getByRole('list', { name: 'ขั้นตอน' }).closest('section')!
    const last = screen.getByText('ผลประเมินล่าสุด')
    expect(card.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no last-result card before the first assessment', () => {
    open('/')
    expect(screen.queryByText('ผลประเมินล่าสุด')).not.toBeInTheDocument()
  })

  it('shows a failure next to the Run button, not buried in the progress band', () => {
    useAssessmentStore.setState({ error: 'API key not valid. Please pass a valid API key.' })
    open('/')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('API key not valid')
    expect(document.getElementById('workflow')!.contains(alert)).toBe(false)
  })
})

describe('home: one container style', () => {
  it('keeps the steps and the form in a single surface, with no dashed drop box and no nested cards', () => {
    open('/')
    const list = screen.getByRole('list', { name: 'ขั้นตอน' })
    const surface = list.closest('section')!
    expect(surface.contains(document.getElementById('torFile')!)).toBe(true) // upload is step 2
    expect(surface.contains(screen.getByLabelText(/ชื่อลูกค้า/))).toBe(true)
    expect(surface.contains(screen.getByRole('button', { name: /Run assessment/ }))).toBe(true) // Run is step 3
    expect(document.querySelector('.border-dashed')).toBeNull() // drag-and-drop is not supported, so nothing should look like a drop target
  })

  it('shows a disabled Run as gray rather than a faded primary', () => {
    open('/')
    expect(screen.getByRole('button', { name: /Run assessment/ }).className).toContain('disabled:bg-tint')
  })
})

describe('zone and service in the matrix', () => {
  const mk = (id: string, s: Req['s'], extra: Partial<Req> = {}): Req => ({ id, module: 'Member', s, conf: '80%', text: `text ${id}`, reason: `reason ${id}`, evidence: `evidence ${id}`, rec: `rec ${id}`, ...extra })
  const data = [
    mk('R-001', 'full', { targets: [{ zone: 'app-custom', service: 'user-management' }] }),
    mk('R-002', 'verify', { targets: [{ zone: 'crm-plus', service: 'campaign-management' }], wantsApi: true }),
    mk('R-003', 'config', { targets: [{ zone: 'crm-plus', service: 'report-analytic' }] }),
  ]
  beforeEach(() => useAssessmentStore.setState({ result: data, selId: 'R-001', filter: 'all', query: '', valid: {} }))

  it('shows zone › service per requirement and the API tag', () => {
    open('/matrix')
    expect(screen.getAllByText('App project — Custom › User Management').length).toBeGreaterThan(0) // the row, and the detail panel of the selected one
    expect(screen.getAllByText('ขอ API · ถาม Tech').length).toBeGreaterThan(0)
  })

  it('filters by zone, by service and by the API tag, and clears them', async () => {
    const user = userEvent.setup()
    open('/matrix')
    await user.selectOptions(screen.getByLabelText('Zone'), 'crm-plus')
    expect(screen.queryByRole('button', { name: 'R-001' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Service'), 'report-analytic')
    expect(screen.getByRole('button', { name: 'R-003' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'R-002' })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'ล้างตัวกรอง' })[0])
    await user.click(screen.getByRole('button', { name: /ขอ API · ถาม Tech · 1/ }))
    expect(screen.getByRole('button', { name: 'R-002' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'R-001' })).not.toBeInTheDocument()
  })

  it('still renders a result saved before zones existed, without zone filters', () => {
    useAssessmentStore.setState({ result: [mk('R-001', 'full')] })
    open('/matrix')
    expect(screen.getByRole('button', { name: 'R-001' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Zone')).not.toBeInTheDocument()
  })

  it('exports Zone, Service and the API flag', async () => {
    const { buildSheets } = await import('@/lib/exportXlsx')
    const { fromReqs } = await import('@/lib/assessment')
    const rows = buildSheets(fromReqs(data), null, {})[0].data
    expect((rows[0] as { value: string }[]).slice(2, 5).map((c) => c.value)).toEqual(['Zone', 'Service', 'ขอ API'])
    expect((rows[2] as { value: string }[]).slice(2, 5).map((c) => c.value)).toEqual(['CRM+ module', 'Campaign Management', 'ขอ API · ถาม Tech'])
  })
})

describe('review zones page', () => {
  const pending = [
    { id: 'R-001', module: 'Member', text: 'ทำแอป', targets: [{ zone: 'app-custom', service: 'unknown' }] },
    { id: 'R-002', module: 'Campaign', text: 'หลังบ้านจัดการ campaign เอง', targets: [{ zone: 'crm-plus', service: 'campaign-management' }] },
    { id: 'R-003', module: 'X', text: 'ไม่รู้ว่าอะไร', targets: [{ zone: 'unknown', service: 'unknown' }] },
  ]

  it('says there is nothing to review when no run is waiting', () => {
    open('/review')
    expect(screen.getByText('ยังไม่มี requirement รอตรวจ')).toBeInTheDocument()
  })

  it('shows the zone breakdown, lists unknown first, and warns about them', () => {
    useAssessmentStore.setState({ review: pending })
    open('/review')
    expect(screen.getByText('TOR นี้ใช้ Buzzebees 3 zone · 3 ข้อ', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'สรุปตาม zone' })).toHaveTextContent('CRM+ module · 1 ข้อ')
    expect(screen.getByText(/ข้อยังไม่ระบุ zone หรือ service/)).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings[0]).toBe('ไม่ทราบ zone')
  })

  it('edits zone, service, extra targets (max 3) and the API flag in the store', async () => {
    const user = userEvent.setup()
    useAssessmentStore.setState({ review: pending })
    open('/review')
    await user.selectOptions(screen.getByLabelText('Service ของ R-001 ตัวที่ 1'), 'point')
    expect(useAssessmentStore.getState().review?.[0].targets).toEqual([{ zone: 'app-custom', service: 'point' }])
    // R-003 (unknown) is listed first, so its add button is the first one; it stays first while it is edited
    await user.click(screen.getAllByRole('button', { name: '+ เพิ่ม target' })[0])
    await user.click(screen.getAllByRole('button', { name: '+ เพิ่ม target' })[0])
    expect(screen.getByLabelText('Zone ของ R-003 ตัวที่ 3')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '+ เพิ่ม target' })).toHaveLength(2) // R-003 is at the maximum of 3
    await user.click(screen.getAllByRole('checkbox')[0])
    expect(useAssessmentStore.getState().review?.some((r) => r.wantsApi)).toBe(true)
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
    expect(screen.getByText('Read the TOR.')).toBeInTheDocument() // back on the home page
  })

  it('keeps the pending review across a reload (it is persisted)', () => {
    useAssessmentStore.setState({ review: pending })
    expect(JSON.parse(localStorage.getItem('tor-scouter')!).state.review).toHaveLength(3)
  })

  it('home points to the review while one is waiting', () => {
    useAssessmentStore.setState({ review: pending, files: [] })
    open('/')
    expect(screen.getByRole('button', { name: /Review zones/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Run assessment/ })).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /Run assessment/ })).toBeEnabled()
  })

  it('saves a finished run to history, and later validation changes to the same entry', async () => {
    reset({ mode: 'account', user: 'ann', owner: 'ann', customer: 'ACME', files: [new File(['x'], 'tor.pdf')], storedKey: { provider: 'gemini', model: 'm', last4: '1234' }, review: [{ id: 'R-001', module: 'M', text: 't', targets: [{ zone: 'app-custom', service: 'point' }] }], result: null })
    server('ann', {
      'POST /api/judge': (b) => json({ results: (b as { requirements: { id: string }[] }).requirements.map((r) => req(r.id, 'full')) }),
      'POST /api/history': () => json({ id: 'h-1' }),
      'PUT /api/history?id=h-1': () => json({ ok: true }),
    })
    await useAssessmentStore.getState().confirmReview()
    await waitFor(() => expect(useAssessmentStore.getState().historyId).toBe('h-1'))
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/history')!
    expect(post.body).toMatchObject({ customer: 'ACME', files: ['tor.pdf'], data: { result: [{ id: 'R-001' }] } })
    useAssessmentStore.setState({ selId: 'R-001' })
    useAssessmentStore.getState().validate('ok')
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/history?id=h-1')).toBe(true), { timeout: 3000 })
    expect(calls.find((c) => c.method === 'PUT')!.body).toMatchObject({ data: { valid: { 'R-001': 'ok' } } })
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
    expect(await screen.findByText('requirement R-002')).toBeInTheDocument() // landed on the matrix
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
