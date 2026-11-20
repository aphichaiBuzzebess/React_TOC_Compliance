// @vitest-environment node
import { loadKb, parseNote, retrieveForTargets, searchKb } from '../../server/kb'
import { classify, judge, toBlocks } from '../../server/pipeline'
import { cleanTargets, DEFAULT_TAXONOMY } from '../../src/data/taxonomy'
import { DEFAULT_PROMPTS, PROMPT_KEYS, UNTRUSTED, buildSystem } from '../../server/prompts'
import { openaiLlm } from '../../server/llm-openai'
import { AI_PROVIDERS } from '../../src/data/models'
import { checkKb, checkNote } from '../../server/kbCheck'
import { checkCoverage, loadTopics } from '../../server/questions'
import { pingProvider } from '../../server/status'
import type { Llm } from '../../server/llm'
import { errorMessage, guard, handle, llmFromRequest, redact, serverDefault } from '../../server/http'
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

describe('toBlocks', () => {
  it('sends an image as an image block with the right media type', async () => {
    const png = await toBlocks('Table.PNG', Buffer.from('abc'))
    expect(png).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from('abc').toString('base64') } }])
    expect((await toBlocks('a.jpeg', Buffer.from('x')))[0]).toMatchObject({ source: { media_type: 'image/jpeg' } })
  })
  it('still rejects unknown types', async () => {
    await expect(toBlocks('a.exe', Buffer.from('x'))).rejects.toThrow('Unsupported')
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

  it('reads provider, key and model from headers', async () => {
    await expect(llmFromRequest(req(ok))).resolves.toEqual({ provider: 'gemini', apiKey: 'user-own-key-123456', model: 'gemini-3.8-flash' })
  })

  it.each([
    ['no provider', { ...ok, 'x-llm-provider': '' }, /provider/],
    ['unknown provider', { ...ok, 'x-llm-provider': 'gpt' }, /provider/],
    ['no key', { ...ok, 'x-llm-key': ' ' }, /API key/],
    ['odd model id', { ...ok, 'x-llm-model': '../etc/passwd?x=1' }, /model/],
  ])('rejects %s', async (_n, headers, msg) => {
    await expect(llmFromRequest(req(headers))).rejects.toThrow(msg)
  })

  it('does not use any server-side key', async () => {
    process.env.ANTHROPIC_API_KEY = 'server-key-should-be-ignored'
    await expect(llmFromRequest(req({ 'x-llm-provider': 'anthropic', 'x-llm-model': 'm' }))).rejects.toThrow(/API key/)
    delete process.env.ANTHROPIC_API_KEY
  })

  describe('operator default AI (LLM_PROVIDER + GEMINI_API_KEY)', () => {
    const none = () => req({})
    beforeEach(() => {
      process.env.LLM_PROVIDER = 'gemini'
      process.env.GEMINI_API_KEY = 'operator-key-123456'
      process.env.GEMINI_MODEL = 'gemini-3.6-flash'
    })
    afterEach(() => {
      for (const k of ['LLM_PROVIDER', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'VERCEL_ENV']) delete process.env[k]
    })

    it('is used when the caller sends no key', async () => {
      await expect(llmFromRequest(none())).resolves.toEqual({ provider: 'gemini', apiKey: 'operator-key-123456', model: 'gemini-3.6-flash' })
    })
    it('falls back to the first listed model when none is configured', async () => {
      delete process.env.GEMINI_MODEL
      expect((await llmFromRequest(none())).model).toBe('gemini-3.8-flash')
    })
    it('loses to a key the caller sends', async () => {
      expect((await llmFromRequest(req(ok))).apiKey).toBe('user-own-key-123456')
    })
    it('needs LLM_PROVIDER: a bare key in the environment is not used', async () => {
      delete process.env.LLM_PROVIDER
      expect(serverDefault()).toBeNull()
      await expect(llmFromRequest(none())).rejects.toThrow(/provider/)
    })
    it('is ignored on a public production site with no access code, and allowed once there is one', () => {
      process.env.VERCEL_ENV = 'production'
      expect(serverDefault()).toBeNull()
      process.env.ACCESS_CODE = 'x'
      expect(serverDefault()).not.toBeNull()
    })
    it('keeps its key out of error messages', async () => {
      const res = await handle(none(), async () => { throw new Error('boom operator-key-123456 end') })
      expect(JSON.stringify(await res.json())).not.toContain('operator-key-123456')
    })
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

describe('taxonomy targets', () => {
  it('cleans anything the model or a client sends', () => {
    expect(cleanTargets(undefined)).toEqual([{ zone: 'unknown', service: 'unknown' }])
    expect(cleanTargets([{ zone: 'mars', service: 'point' }])).toEqual([{ zone: 'unknown', service: 'point' }])
    expect(cleanTargets([null, 5, 'x', {}])).toEqual([{ zone: 'unknown', service: 'unknown' }])
    expect(cleanTargets([{ zone: 'crm-plus', service: 'point' }, { zone: 'crm-plus', service: 'point' }])).toHaveLength(1)
    expect(cleanTargets([{ zone: 'x', service: 'y' }, { zone: 'app-custom', service: 'unknown' }])).toEqual([{ zone: 'app-custom', service: 'unknown' }])
    const four = ['internal', 'crm-plus', 'app-standard', 'app-custom'].map((zone) => ({ zone, service: 'point' }))
    expect(cleanTargets(four)).toHaveLength(3)
  })
})

describe('kb service and zone', () => {
  const kb = loadKb('kb')
  const fm = (extra: string) => `---\ntitle: a\nmodule: b\nsupport: full\n${extra}\n---\nbody`
  it('reads service and zone, and drops ids it does not know', () => {
    expect(parseNote('x.md', fm('service: point\nzone: crm-plus, app-custom'))).toMatchObject({ service: 'point', zone: ['crm-plus', 'app-custom'] })
    const bad = parseNote('x.md', fm('service: nope\nzone: mars'))!
    expect(bad.service).toBeUndefined()
    expect(bad.zone).toBeUndefined()
  })
  it('tags every shipped note with a service', () => {
    expect(kb.every((n) => n.service)).toBe(true)
  })
  it('only offers the notes of the requirement\'s service', () => {
    const { notes } = retrieveForTargets(kb, 'คะแนนหมดอายุ', [{ zone: 'app-custom', service: 'point' }])
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((n) => n.service === 'point')).toBe(true)
  })
  it('keeps a zone-limited note out of other zones, and returns nothing when no note fits', () => {
    const only = [{ ...kb[0], service: 'point', zone: ['crm-plus'] }]
    expect(retrieveForTargets(only, kb[0].body, [{ zone: 'app-custom', service: 'point' }]).notes).toEqual([])
    expect(retrieveForTargets(only, kb[0].body, [{ zone: 'crm-plus', service: 'point' }]).notes).toHaveLength(1)
    expect(retrieveForTargets(kb, 'anything', [{ zone: 'unknown', service: 'unknown' }]).notes).toEqual([])
    expect(retrieveForTargets(kb, 'anything', [{ zone: 'app-custom', service: 'unknown' }]).notes).toEqual([])
  })
  it('falls back to the whole service pool when the text matches nothing', () => {
    expect(retrieveForTargets(kb, 'zzzz qqqq', [{ zone: 'app-custom', service: 'point' }]).notes.length).toBeGreaterThan(0)
  })
})

describe('classify', () => {
  const reqs = [
    { id: 'R-001', module: 'Point', text: 'a' },
    { id: 'R-002', module: 'X', text: 'b' },
    { id: 'R-003', module: 'Y', text: 'c' },
  ]
  const llm: Llm = async () =>
    ({
      items: [
        { id: 'R-001', targets: [{ zone: 'crm-plus', service: 'campaign-management' }], wantsApi: true },
        { id: 'R-002', targets: [{ zone: 'mars', service: 'moon' }], wantsApi: 'yes' },
      ],
    }) as never
  it('keeps valid output, turns bad ids into unknown, and defaults a missing item', async () => {
    const out = await classify(llm, reqs)
    expect(out[0]).toMatchObject({ targets: [{ zone: 'crm-plus', service: 'campaign-management' }], wantsApi: true })
    expect(out[1]).toMatchObject({ targets: [{ zone: 'unknown', service: 'unknown' }], wantsApi: false }) // 'yes' is not a boolean
    expect(out[2]).toMatchObject({ targets: [{ zone: 'unknown', service: 'unknown' }], wantsApi: false })
  })
  it('survives a model that returns nothing usable', async () => {
    const out = await classify((async () => ({})) as never, reqs)
    expect(out).toHaveLength(3)
    expect(out[0].wantsApi).toBe(false)
  })
})

describe('judge with targets', () => {
  const kb = loadKb('kb')
  const say = (verdicts: unknown[]): Llm => (async () => ({ verdicts })) as never
  it('shows evidence per target', async () => {
    const llm = say([{ id: 'R-1', s: 'full', confidence: 0.9, reason: 'ok', sources: ['point/expiry-policy.md'], rec: 'use' }])
    const [r] = await judge(llm, [{ id: 'R-1', module: 'Point', text: 'คะแนนหมดอายุ rolling', targets: [{ zone: 'app-custom', service: 'point' }] }], kb)
    expect(r).toMatchObject({ s: 'full', evidence: 'App project — Custom › Point Service: KB › Point › Point expiry policy', targets: [{ zone: 'app-custom', service: 'point' }] })
  })
  it('never lets the model judge an own-system API request, even when a note matches', async () => {
    const llm = say([{ id: 'R-1', s: 'integ', confidence: 0.95, reason: 'burn api', sources: ['integration/burn-api.md'], rec: 'x' }])
    const [r] = await judge(llm, [{ id: 'R-1', module: 'Point', text: 'ขอ API หักคะแนน', targets: [{ zone: 'app-custom', service: 'point' }], wantsApi: true }], kb)
    expect(r).toMatchObject({ s: 'verify', conf: '0%', wantsApi: true })
    expect(r.reason).toContain('ถาม Tech')
    expect(r.evidence).toContain('Burn API')
  })
  it('leaves a checkout-via-API requirement to the KB (integ)', async () => {
    const llm = say([{ id: 'R-1', s: 'integ', confidence: 0.9, reason: 'burn api', sources: ['integration/burn-api.md'], rec: 'connect' }])
    const [r] = await judge(llm, [{ id: 'R-1', module: 'Point', text: 'checkout ของเว็บหักคะแนนผ่าน API', targets: [{ zone: 'app-custom', service: 'point' }], wantsApi: false }], kb)
    expect(r.s).toBe('integ')
  })
  it('is verify when one target has no note at all, and names it', async () => {
    const llm = say([{ id: 'R-1', s: 'full', confidence: 0.9, reason: 'ok', sources: ['point/expiry-policy.md'], rec: 'use' }])
    const [r] = await judge(llm, [{ id: 'R-1', module: 'Point', text: 'คะแนนหมดอายุ และส่ง notification', targets: [{ zone: 'app-custom', service: 'point' }, { zone: 'app-custom', service: 'notification' }] }], kb)
    expect(r.s).toBe('verify')
    expect(r.reason).toContain('Notification')
    expect(r.evidence).toContain('Notification: ไม่พบหลักฐานที่ตรงกัน')
  })
  it('judges a zone-only target as verify', async () => {
    const llm = say([{ id: 'R-1', s: 'full', confidence: 0.9, reason: 'ok', sources: [], rec: 'x' }])
    const [r] = await judge(llm, [{ id: 'R-1', module: 'App', text: 'ทำแอปและเว็บ', targets: [{ zone: 'app-custom', service: 'unknown' }] }], kb)
    expect(r.s).toBe('verify')
  })
})

describe('adding knowledge', () => {
  const note = (fm: string, body = 'เนื้อหา') => `---\n${fm}\n---\n${body}`
  it('accepts a note with only title, a readable service name and support', () => {
    const n = parseNote('x.md', note('title: a\nservice: point service\nsupport: full'))!
    expect(n).toMatchObject({ service: 'point', module: 'Point Service', updated: '' })
  })
  it('accepts zone written as its label', () => {
    expect(parseNote('x.md', note('title: a\nservice: Point Service\nsupport: full\nzone: CRM+ module, mars'))!.zone).toEqual(['crm-plus'])
  })
  it('does not treat the template or other _ files as notes', () => {
    expect(loadKb('kb').some((n) => n.path.includes('_template'))).toBe(false)
  })
  it('says what is wrong with a note, in words', () => {
    expect(checkNote('no frontmatter')[0]).toContain('frontmatter')
    const typo = checkNote(note('title: a\nservice: Point Servce\nsupport: ful'))
    expect(typo.join('|')).toContain('support ต้องเป็น')
    expect(typo.join('|')).toContain('ใกล้เคียง "Point Service"')
    expect(checkNote(note('title: a\nsupport: full'))[0]).toContain('ไม่มี service')
    expect(checkNote(note('title: a\nservice: point\nsupport: full', ''))).toEqual(['เนื้อหาว่าง'])
    expect(checkNote(note('title: a\nservice: point\nsupport: full\nzone: mars'))[0]).toContain('zone "mars"')
  })
  it('the shipped knowledge base has no problems', () => {
    expect(checkKb('kb')).toEqual([])
  })
})

describe('prompts as data', () => {
  const tx = { ...DEFAULT_TAXONOMY, services: [...DEFAULT_TAXONOMY.services, { id: 'old-one', label: 'Old one', hint: 'retired', confirmed: true, archived: true }, { id: 'x-new', label: 'New one', hint: 'fresh', confirmed: true, examples: ['เชื่อมระบบ X'] }] }
  it('always ends with the guard and keeps the output untouched by the editor', () => {
    for (const k of PROMPT_KEYS) expect(buildSystem(k, 'just my own words').endsWith(UNTRUSTED)).toBe(true)
    expect(buildSystem('judge', '  hello  ')).toBe(`hello ${UNTRUSTED}`)
  })
  it('puts the zone and service lists in place, or appends them when the editor removed the placeholders', () => {
    const inPlace = buildSystem('classify', 'A\nZones:\n{{zones}}\nmiddle\n{{services}}\nend', tx)
    expect(inPlace).toMatch(/A\nZones:\n- internal: Internal product/)
    expect(inPlace.indexOf('middle')).toBeGreaterThan(inPlace.indexOf('crm-plus'))
    const lost = buildSystem('classify', 'only my instructions', tx)
    expect(lost).toContain('Zones:\n- internal')
    expect(lost).toContain('Services:\n- user-management')
    expect(lost).not.toContain('{{')
  })
  it('leaves archived entries out, and includes examples', () => {
    const p = buildSystem('classify', DEFAULT_PROMPTS.classify, tx)
    expect(p).not.toContain('old-one')
    expect(p).toContain('x-new: New one. fresh')
    expect(p).toContain('e.g. "เชื่อมระบบ X"')
  })
  it('the default prompts reproduce today\'s wording', () => {
    expect(buildSystem('extract', DEFAULT_PROMPTS.extract)).toContain('You are a business analyst. Split the customer TOR into atomic')
    expect(buildSystem('judge', DEFAULT_PROMPTS.judge)).toContain('using ONLY the knowledge-base notes given')
  })
  it('classify and judge use an edited prompt and taxonomy when given one', async () => {
    let seen = ''
    const llm = (async (o: { system: string }) => { seen = o.system; return { items: [], verdicts: [] } }) as never
    await classify(llm, [{ id: 'R-1', module: 'M', text: 't' }], { taxonomy: tx, prompts: { classify: 'EDITED {{services}}' } })
    expect(seen.startsWith('EDITED - user-management')).toBe(true)
    expect(seen).toContain('x-new')
    await judge(llm, [{ id: 'R-1', module: 'M', text: 't' }], [], { prompts: { judge: 'EDITED JUDGE' } })
    expect(seen).toBe(`EDITED JUDGE ${UNTRUSTED}`)
  })
})

describe('ChatGPT (OpenAI) provider', () => {
  const tool = { name: 'report', description: 'Report it.', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } }
  const reply = (body: unknown, status = 200) => (async () => ({ ok: status < 400, status, json: async () => body }) as Response) as unknown as typeof fetch
  const answer = (args: string) => ({ choices: [{ message: { tool_calls: [{ function: { name: 'report', arguments: args } }] } }] })

  it('sends the key, the model, a forced function call, and text, image and PDF parts', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const fetcher = (async (url: string, init: RequestInit) => { seen = { url, init }; return { ok: true, status: 200, json: async () => answer('{"ok":true}') } as Response }) as unknown as typeof fetch
    const llm = openaiLlm({ provider: 'openai', apiKey: 'sk-test-123456789', model: 'gpt-5' }, fetcher)
    const out = await llm<{ ok: boolean }>({
      system: 'be brief', tool,
      content: [{ type: 'text', text: 'hello' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' } }],
    })
    expect(out).toEqual({ ok: true })
    expect(seen!.url).toBe('https://api.openai.com/v1/chat/completions')
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-123456789')
    const body = JSON.parse(seen!.init.body as string)
    expect(body).toMatchObject({ model: 'gpt-5', tool_choice: { type: 'function', function: { name: 'report' } } })
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(16000)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be brief' })
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      { type: 'file', file: { filename: 'tor.pdf', file_data: 'data:application/pdf;base64,BBB' } },
    ])
    expect(body.tools[0].function.parameters).toEqual(tool.schema)
  })

  it('turns an error response into a readable message, and refuses a missing or broken answer', async () => {
    const cfg = { provider: 'openai' as const, apiKey: 'sk-test-123456789', model: 'gpt-5' }
    const call = (f: typeof fetch) => openaiLlm(cfg, f)({ system: 's', content: [{ type: 'text', text: 'x' }], tool })
    await expect(call(reply({ error: { message: 'Incorrect API key provided' } }, 401))).rejects.toThrow('401 Incorrect API key provided')
    await expect(call(reply({ choices: [{ message: {} }] }))).rejects.toThrow('no structured answer')
    await expect(call(reply(answer('{not json')))).rejects.toThrow('invalid JSON')
  })

  it('is an accepted provider: header, stored key, operator default and the model list', async () => {
    const r = new Request('http://localhost/api/extract', { method: 'POST', headers: { 'x-llm-provider': 'openai', 'x-llm-model': 'gpt-5', 'x-llm-key': 'sk-test-123456789' } })
    await expect(llmFromRequest(r)).resolves.toEqual({ provider: 'openai', apiKey: 'sk-test-123456789', model: 'gpt-5' })
    process.env.LLM_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'operator-openai-key-123'
    expect(serverDefault()).toEqual({ provider: 'openai', apiKey: 'operator-openai-key-123', model: 'gpt-5' }) // first listed model
    process.env.OPENAI_MODEL = 'gpt-4.1'
    expect(serverDefault()!.model).toBe('gpt-4.1')
    delete process.env.LLM_PROVIDER; delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(['anthropic', 'gemini', 'openai'])
  })
})
