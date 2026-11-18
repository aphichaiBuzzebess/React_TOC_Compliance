// @vitest-environment node
import { loadKb, parseNote, searchKb } from '../../server/kb'
import { judge } from '../../server/pipeline'
import { checkCoverage, loadTopics } from '../../server/questions'
import { pingProvider } from '../../server/status'
import type { Llm } from '../../server/llm'
import { errorMessage, guard, handle, llmFromRequest, redact } from '../../server/http'
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

describe('per-request AI settings', () => {
  const req = (h: Record<string, string>) => new Request('http://x/api', { method: 'POST', headers: h })
  const ok = { 'x-llm-provider': 'gemini', 'x-llm-key': 'user-own-key-123456', 'x-llm-model': 'gemini-3.8-flash' }

  afterEach(() => {
    delete process.env.ACCESS_CODE
    vi.resetModules()
    vi.doUnmock('@google/genai')
  })

  it('reads provider, key and model from headers', () => {
    expect(llmFromRequest(req(ok))).toEqual({ provider: 'gemini', apiKey: 'user-own-key-123456', model: 'gemini-3.8-flash' })
  })

  it.each([
    ['no provider', { ...ok, 'x-llm-provider': '' }, /provider/],
    ['unknown provider', { ...ok, 'x-llm-provider': 'gpt' }, /provider/],
    ['no key', { ...ok, 'x-llm-key': ' ' }, /API key/],
    ['odd model id', { ...ok, 'x-llm-model': '../etc/passwd?x=1' }, /model/],
  ])('rejects %s', (_n, headers, msg) => {
    expect(() => llmFromRequest(req(headers))).toThrow(msg)
  })

  it('does not use any server-side key', () => {
    process.env.ANTHROPIC_API_KEY = 'server-key-should-be-ignored'
    expect(() => llmFromRequest(req({ 'x-llm-provider': 'anthropic', 'x-llm-model': 'm' }))).toThrow(/API key/)
    delete process.env.ANTHROPIC_API_KEY
  })

  it('access code is optional: open when unset, enforced when set', () => {
    expect(guard(req({}))).toBeNull()
    process.env.ACCESS_CODE = 'abc'
    expect(guard(req({}))?.status).toBe(401)
    expect(guard(req({ 'x-access-code': 'abc' }))).toBeNull()
  })

  it('keeps the key out of error responses', async () => {
    const res = await handle(req(ok), async () => {
      throw new Error('401 bad key user-own-key-123456')
    })
    expect(res.status).toBe(400)
    expect(await res.text()).not.toContain('user-own-key')
    expect(redact('x user-own-key-123456 y', 'user-own-key-123456')).toBe('x *** y')
  })

  it('sends a schema-constrained request to Gemini with the caller key and model', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: '{"ok":true}' })
    const ctor = vi.fn()
    vi.doMock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; constructor(o: unknown) { ctor(o) } } }))
    const { createLlm: create } = await import('../../server/llm')
    const schema = { type: 'object' }
    const out = await create({ provider: 'gemini', apiKey: 'user-own-key-123456', model: 'gemini-x' })({
      system: 'sys',
      content: [{ type: 'text', text: 'hi' }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } }],
      tool: { name: 't', description: 'desc', schema },
    })
    expect(out).toEqual({ ok: true })
    expect(ctor).toHaveBeenCalledWith({ apiKey: 'user-own-key-123456' })
    const arg = generateContent.mock.calls[0][0]
    expect(arg.model).toBe('gemini-x')
    expect(arg.contents[0].parts).toEqual([{ text: 'hi' }, { inlineData: { mimeType: 'application/pdf', data: 'QUJD' } }])
    expect(arg.config).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: schema })
  })
})

describe('error messages', () => {
  it('shows the readable part of a provider JSON error', () => {
    expect(errorMessage(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"}}'), '')).toBe('401 Invalid bearer token')
    expect(errorMessage(new Error('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key."}}'), '')).toBe('API key not valid. Please pass a valid API key.')
    expect(errorMessage(new Error('plain failure {not json'), '')).toBe('plain failure {not json')
  })
})

describe('connection test', () => {
  const cfg = { provider: 'anthropic' as const, apiKey: 'sk-test-abcdef123456', model: 'm' }
  it('pings ok', async () => {
    expect(await pingProvider(cfg, (async () => ({ ok: true })) as never)).toMatchObject({ ok: true })
  })
  it('reports a failure with the key redacted', async () => {
    const bad = (async () => {
      throw new Error('401 invalid x-api-key sk-test-abcdef123456')
    }) as never
    const r = await pingProvider(cfg, bad)
    expect(r).toMatchObject({ ok: false, error: '401 invalid x-api-key ***' })
  })
})

describe('gemini output handling', () => {
  const tool = { name: 't', description: 'd', schema: { type: 'object' } }
  const ask = async (replies: { text?: string; finishReason?: string }[]) => {
    const generateContent = vi.fn()
    for (const r of replies) generateContent.mockResolvedValueOnce({ text: r.text, candidates: [{ finishReason: r.finishReason }] })
    vi.resetModules()
    vi.doMock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent } } }))
    const { geminiLlm } = await import('../../server/llm-gemini')
    const run = geminiLlm({ provider: 'gemini', apiKey: 'k', model: 'm' })({ system: 's', content: [], tool })
    return { run, generateContent }
  }
  afterEach(() => vi.doUnmock('@google/genai'))

  it('accepts JSON wrapped in a code fence or extra text', async () => {
    const { run } = await ask([{ text: '```json\n{"a":1}\n```' }])
    expect(await run).toEqual({ a: 1 })
    const { run: run2 } = await ask([{ text: 'Here you go: {"b":2} done' }])
    expect(await run2).toEqual({ b: 2 })
  })

  it('retries with a bigger limit when the answer was cut off', async () => {
    const { run, generateContent } = await ask([{ text: '{"topics":[{"fun', finishReason: 'MAX_TOKENS' }, { text: '{"topics":[]}', finishReason: 'STOP' }])
    expect(await run).toEqual({ topics: [] })
    const limits = generateContent.mock.calls.map((c) => c[0].config.maxOutputTokens)
    expect(limits[0]).toBeGreaterThanOrEqual(32768)
    expect(limits[1]).toBe(limits[0] * 2)
  })

  it('gives up after 3 tries and names the finish reason', async () => {
    const bad = { text: '{"x":', finishReason: 'MAX_TOKENS' }
    const { run, generateContent } = await ask([bad, bad, bad])
    await expect(run).rejects.toThrow(/3 tries \(finish reason: MAX_TOKENS\)/)
    expect(generateContent).toHaveBeenCalledTimes(3)
  })
})
