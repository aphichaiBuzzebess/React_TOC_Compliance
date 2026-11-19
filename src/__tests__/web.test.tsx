import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import type { Req } from '@/lib/types'
import { pageSlices } from '@/lib/exportPdf'

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
  useAssessmentStore.setState({ result: null, coverage: null, selId: null, valid: {}, apiKey: '', accessCode: '' })
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
    useAssessmentStore.setState({ file: new File(['x'], 'tor.pdf'), apiKey: '' })
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
    expect((sheets[0].data[1][8] as { value: string }).value).toBe('Confirmed by PM')
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
      if (url === '/api/judge') return ok({ results: (JSON.parse(init.body as string).requirements as typeof reqs).map((r) => req(r.id, 'full')) })
      return questionsOk ? ok({ topics: [{ function: 'Point', coverage: 'covered', reqIds: [], open: [] }] }) : ({ ok: false, status: 500, json: async () => ({ error: 'quota exceeded' }) } as Response)
    }))
    useAssessmentStore.setState({ file: new File(['x'], 'tor.pdf'), apiKey: 'k-123456789', running: false, step: -1, error: null })
    await useAssessmentStore.getState().runReal()
    return useAssessmentStore.getState()
  }

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
    expect(calls).toEqual(['/api/questions'])
    expect(s.coverage).toHaveLength(1)
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

  it('every status badge has at least 4.5:1 text contrast', async () => {
    const { STATUS } = await import('@/data/tor')
    for (const [k, s] of Object.entries(STATUS)) expect(ratio(s.fg, s.bg), `${k} ${s.fg} on ${s.bg}`).toBeGreaterThanOrEqual(4.5)
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
    useAssessmentStore.setState({ file: null, apiKey: '' })
    open('/')
    const hint = screen.getByText('เลือกไฟล์ TOR และใส่ API key ที่ AI settings ก่อน')
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
  const steps = () => within(screen.getByRole('list', { name: 'ขั้นตอน' }))

  beforeEach(() => {
    useAssessmentStore.setState({ result: null, coverage: null, file: null, apiKey: '', running: false, step: -1, error: null, detail: '', startedAt: null })
  })

  it('tells a first-time user what is missing, in order, and marks the current step', () => {
    open('/')
    const items = steps().getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveAttribute('aria-current', 'step') // key comes first
    expect(items[0]).toHaveTextContent('ใส่ AI key')
    expect(items[2]).toHaveTextContent('ทำข้อ 1 และ 2 ก่อน')
  })

  it('ticks steps off as the key and file arrive, and then Run is ready', () => {
    useAssessmentStore.setState({ apiKey: 'k-123456789', file: new File(['x'], 'bangchak-tor.pdf') })
    open('/')
    const items = steps().getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('✓')
    expect(items[1]).toHaveTextContent('bangchak-tor.pdf')
    expect(items[2]).toHaveAttribute('aria-current', 'step')
    expect(items[2]).toHaveTextContent('พร้อมแล้ว')
    expect(screen.getByRole('button', { name: /Run assessment/ })).toBeEnabled()
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
    expect(screen.getByRole('button', { name: 'Matrix' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
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
