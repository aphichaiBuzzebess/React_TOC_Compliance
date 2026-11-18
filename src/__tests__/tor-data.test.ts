import { MODULES, ORDER, REQS, STATUS, TOTAL } from '@/data/tor'
import { useAssessmentStore } from '@/store/useAssessmentStore'

describe('sample data', () => {
  it('status counts add up to the TOR total', () => {
    expect(ORDER.reduce((n, k) => n + STATUS[k].count, 0)).toBe(TOTAL)
    expect(MODULES.reduce((n, m) => n + m[1], 0)).toBe(TOTAL)
  })
  it('requirement IDs are unique', () => {
    expect(new Set(REQS.map((r) => r.id)).size).toBe(REQS.length)
  })
})

describe('validation store', () => {
  it('records PM validation for the selected requirement', () => {
    useAssessmentStore.getState().select('R-001')
    useAssessmentStore.getState().validate('ok')
    expect(useAssessmentStore.getState().valid['R-001']).toBe('ok')
  })
})
