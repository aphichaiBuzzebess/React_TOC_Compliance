import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { useAssessmentStore } from '@/store/useAssessmentStore'
import type { Req } from '@/lib/types'

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
  it('opens the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    useAssessmentStore.setState({ result: [req('R-001', 'full')] })
    open('/summary')
    screen.getByRole('button', { name: 'Download PDF' }).click()
    expect(print).toHaveBeenCalled()
    print.mockRestore()
  })
})
