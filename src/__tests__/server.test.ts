// @vitest-environment node
import { loadKb, parseNote, searchKb } from '../../server/kb'
import { judge } from '../../server/pipeline'
import { checkCoverage, loadTopics } from '../../server/questions'
import { pingProvider, providerStatus } from '../../server/status'
import { createLlm, type Llm } from '../../server/llm'
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

describe('llm provider', () => {
  afterEach(() => {
    delete process.env.LLM_PROVIDER
    delete process.env.GEMINI_API_KEY
    vi.resetModules()
    vi.doUnmock('@google/genai')
  })

  it('rejects an unknown provider before any call', () => {
    process.env.LLM_PROVIDER = 'gpt'
    expect(() => createLlm()).toThrow(/Unknown LLM_PROVIDER/)
  })

  it('fails clearly when the Gemini key is missing', async () => {
    process.env.LLM_PROVIDER = 'gemini'
    await expect(createLlm()({ system: 's', content: [], tool: { name: 't', description: 'd', schema: {} } })).rejects.toThrow('GEMINI_API_KEY is not set')
  })

  it('sends a schema-constrained request to Gemini and parses the JSON', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"ok":true}' })
    vi.doMock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent } } }))
    process.env.LLM_PROVIDER = 'gemini'
    process.env.GEMINI_API_KEY = 'test'
    const { createLlm: create } = await import('../../server/llm')
    const schema = { type: 'object' }
    const out = await create()({
      system: 'sys',
      content: [{ type: 'text', text: 'hi' }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } }],
      tool: { name: 't', description: 'desc', schema },
    })
    expect(out).toEqual({ ok: true })
    const arg = generateContent.mock.calls[0][0]
    expect(arg.contents[0].parts).toEqual([{ text: 'hi' }, { inlineData: { mimeType: 'application/pdf', data: 'QUJD' } }])
    expect(arg.config).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: schema })
    expect(arg.config.systemInstruction).toContain('sys')
  })
})

describe('ai status', () => {
  afterEach(() => {
    for (const k of ['LLM_PROVIDER', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY']) delete process.env[k]
  })

  it('reports which keys are set without ever returning a value', () => {
    process.env.GEMINI_API_KEY = 'super-secret-gemini-key'
    const s = providerStatus()
    expect(s.active).toBe('anthropic')
    expect(s.providers.find((p) => p.id === 'gemini')).toMatchObject({ keySet: true, envVar: 'GEMINI_API_KEY' })
    expect(s.providers.find((p) => p.id === 'anthropic')?.keySet).toBe(false)
    expect(JSON.stringify(s)).not.toContain('super-secret')
  })

  it('flags an invalid LLM_PROVIDER instead of throwing', () => {
    process.env.LLM_PROVIDER = 'gpt'
    expect(providerStatus()).toMatchObject({ active: null, error: expect.stringContaining('Unknown LLM_PROVIDER') })
  })

  it('does not call the model when the key is missing', async () => {
    const llm = vi.fn()
    expect(await pingProvider('anthropic', llm as never)).toMatchObject({ ok: false, error: 'ANTHROPIC_API_KEY is not set' })
    expect(llm).not.toHaveBeenCalled()
  })

  it('pings ok, and redacts the key from an error message', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-abcdef123456'
    expect(await pingProvider('anthropic', (async () => ({ ok: true })) as never)).toMatchObject({ ok: true })
    const bad = (async () => {
      throw new Error('401 invalid x-api-key sk-test-abcdef123456')
    }) as never
    const r = await pingProvider('anthropic', bad)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('401 invalid x-api-key ***')
  })
})
