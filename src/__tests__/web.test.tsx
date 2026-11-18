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
