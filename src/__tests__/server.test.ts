// @vitest-environment node
import { loadKb, parseNote, searchKb } from '../../server/kb'
import { judge } from '../../server/pipeline'
import { checkCoverage, loadTopics } from '../../server/questions'
import type { Llm } from '../../server/llm'
import { fromReqs } from '@/lib/assessment'
import type { Req } from '@/lib/types'

describe('kb vault', () => {
  const kb = loadKb('kb')
  it('loads every note and skips README', () => {
    expect(kb.length).toBe(12)
    expect(kb.some((n) => n.path === 'README.md')).toBe(false)
  })
  it('rejects notes with a bad support level', () => {
    expect(parseNote('x.md', '---\ntitle: a\nmodule: b\nsupport: maybe\n---\nbody')).toBeNull()
  })
  it('finds Thai and English matches', () => {
    expect(searchKb(kb, 'Member รวมบัญชีสมาชิก (Merge) จากหลาย Brand')[0].path).toBe('member/multi-brand-profile.md')
    expect(searchKb(kb, 'PDPA consent')[0].path).toBe('security/pdpa-consent.md')
  })
  it('returns nothing for unrelated text', () => {
    expect(searchKb(kb, 'zzzz qqqq')).toEqual([])
  })
})

describe('judge', () => {
  const kb = loadKb('kb')
  const reqs = [
    { id: 'R-001', module: 'Member', text: 'สมัครสมาชิกผ่าน LINE OA' },
    { id: 'R-002', module: 'Point', text: 'ใช้คะแนนร่วมข้าม Brand ในเครือ (Coalition)' },
    { id: 'R-003', module: 'X', text: 'unknown' },
  ]
  // Fake model: says "full" for everything, citing one real note, one fake path, and none.
  const llm: Llm = async () =>
    ({
      verdicts: [
        { id: 'R-001', s: 'full', confidence: 0.92, reason: 'ok', sources: ['member/registration-channels.md'], rec: 'use' },
        { id: 'R-002', s: 'full', confidence: 0.9, reason: 'invented', sources: ['made/up.md'], rec: 'use' },
      ],
    }) as never

  it('keeps cited verdicts, downgrades uncited ones, and fills missing ones', async () => {
    const out = await judge(llm, reqs, kb)
    expect(out[0]).toMatchObject({ s: 'full', conf: '92%', evidence: 'KB › Member › Registration channels' })
    expect(out[1].s).toBe('verify') // cited a note that does not exist
    expect(out[2].s).toBe('verify') // model skipped it
  })
})

describe('fromReqs', () => {
  it('derives counts, modules and gaps', () => {
    const r = (id: string, module: string, s: Req['s']): Req => ({ id, module, s, conf: '1%', text: id, reason: 'r', evidence: 'e', rec: 'c' })
    const a = fromReqs([r('1', 'A', 'full'), r('2', 'A', 'integ'), r('3', 'B', 'none')])
    expect(a.counts).toMatchObject({ full: 1, integ: 1, none: 1, verify: 0 })
    expect(a.modules).toEqual([['A', 2, 1], ['B', 1, 0]])
    expect(a.gaps.map((g) => g.ids)).toEqual(['2', '3'])
  })
})

describe('open-question coverage', () => {
  const topics = loadTopics('questions')
  const reqs = [{ id: 'R-001', module: 'Point', text: 'คะแนนหมดอายุ 24 เดือน' }]
  const point = topics.find((t) => t.function === 'Point')!
  const reg = topics.find((t) => t.function === 'Register')!

  it('loads the Basic Question topics', () => {
    expect(topics.length).toBe(19)
    expect(topics.reduce((n, t) => n + t.questions.length, 0)).toBe(40)
  })

  it('normalises model output: maps ids to text, drops fakes, fills unseen topics', async () => {
    const llm: Llm = async () =>
      ({
        topics: [
          // partial: one real open question, one invented id, one invented requirement
          { function: 'Point', coverage: 'partial', reqIds: ['R-001', 'R-999'], open: [point.questions[0].id, 'nope'] },
          // claims covered but still lists open questions -> covered wins
          { function: 'Register', coverage: 'covered', reqIds: [], open: [reg.questions[0].id] },
        ],
      }) as never
    const out = await checkCoverage(llm, reqs, topics)
    const p = out.find((o) => o.function === 'Point')!
    expect(p).toMatchObject({ coverage: 'partial', reqIds: ['R-001'], open: [point.questions[0].text] })
    expect(out.find((o) => o.function === 'Register')).toMatchObject({ coverage: 'covered', open: [] })
    const unseen = out.find((o) => o.function === 'Migration')! // model never mentioned it
    expect(unseen.coverage).toBe('missing')
    expect(unseen.open.length).toBeGreaterThan(0)
    expect(out).toHaveLength(topics.length)
  })
})
