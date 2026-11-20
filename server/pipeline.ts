import { readSheet } from 'read-excel-file/node'
import mammoth from 'mammoth'
import type { RawReq, Req, StatusKey, Verdict } from '../src/lib/types.js'
import type { Block, Llm } from './llm.js'
import { retrieveForTargets, searchKb, type Note } from './kb.js'
import { DEFAULT_TAXONOMY, UNKNOWN, activeServices, activeZones, cleanTargets, serviceLabel, zoneLabel, type Target, type Taxonomy } from '../src/data/taxonomy.js'
import { DEFAULT_PROMPTS, buildSystem, type PromptKey } from './prompts.js'

const STATUSES: StatusKey[] = ['full', 'config', 'custom', 'integ', 'none', 'verify']

/** What a step needs besides its input: the taxonomy and the prompt texts. Everything is optional; the built-in ones are used when absent. */
export interface Ctx { taxonomy?: Taxonomy; prompts?: Partial<Record<PromptKey, string>> }
const sys = (key: PromptKey, k?: Ctx) => buildSystem(key, k?.prompts?.[key] ?? DEFAULT_PROMPTS[key], k?.taxonomy ?? DEFAULT_TAXONOMY)

const IMAGES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** TOR file -> content blocks the model can read. */
export async function toBlocks(name: string, bytes: Buffer): Promise<Block[]> {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } }]
  if (ext === 'docx') return [{ type: 'text', text: (await mammoth.extractRawText({ buffer: bytes })).value }]
  if (ext === 'xlsx') {
    const rows = (await readSheet(bytes)) as unknown[][]
    return [{ type: 'text', text: rows.map((r) => r.map((c) => c ?? '').join(' | ')).join('\n') }]
  }
  const image = IMAGES[ext ?? '']
  if (image) return [{ type: 'image', source: { type: 'base64', media_type: image, data: bytes.toString('base64') } }]
  throw new Error('Unsupported file type: use PDF, DOCX, XLSX or an image (PNG, JPG, WEBP, GIF)')
}

const EXTRACT_TOOL = {
  name: 'report_requirements',
  description: 'Report every distinct requirement found in the customer TOR.',
  schema: {
    type: 'object',
    properties: {
      requirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            module: { type: 'string', description: 'Functional area, e.g. Member, Point, Campaign, Reward, CRM, Reporting, Integration, Security' },
            text: { type: 'string', description: 'One requirement, one sentence, in the TOR language' },
          },
          required: ['module', 'text'],
        },
      },
    },
    required: ['requirements'],
  },
}

export async function extractRequirements(llm: Llm, blocks: Block[], k?: Ctx): Promise<RawReq[]> {
  const out = await llm<{ requirements: { module: string; text: string }[] }>({
    system: sys('extract', k),
    content: [...blocks, { type: 'text', text: 'List every requirement. If this is an image, read the requirements shown in it.' }],
    tool: EXTRACT_TOOL,
    maxTokens: 16000,
  })
  return out.requirements.map((r, i) => ({ id: `R-${String(i + 1).padStart(3, '0')}`, module: r.module, text: r.text }))
}

const JUDGE_TOOL = {
  name: 'report_verdicts',
  description: 'Report one verdict per requirement.',
  schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            s: { type: 'string', enum: STATUSES },
            confidence: { type: 'number', description: '0 to 1' },
            reason: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' }, description: 'KB note paths that support the verdict' },
            rec: { type: 'string', description: 'Recommended feature or solution' },
          },
          required: ['id', 's', 'confidence', 'reason', 'sources', 'rec'],
        },
      },
    },
    required: ['verdicts'],
  },
}

const classifyTool = (tx: Taxonomy) => ({
  name: 'report_targets',
  description: 'For every requirement, say which Buzzebees zone and service it belongs to.',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            targets: {
              type: 'array',
              description: '1 to 3 places the requirement lands. Use "unknown" when nothing fits; never guess.',
              items: {
                type: 'object',
                properties: {
                  zone: { type: 'string', enum: [...activeZones(tx).map((z) => z.id), UNKNOWN] },
                  service: { type: 'string', enum: [...activeServices(tx).map((s) => s.id), UNKNOWN] },
                },
                required: ['zone', 'service'],
              },
            },
            wantsApi: { type: 'boolean', description: 'true only when the customer builds their own system INSTEAD of using the Buzzebees tool and asks for an API for it' },
          },
          required: ['id', 'targets', 'wantsApi'],
        },
      },
    },
    required: ['items'],
  },
})

/** Add zone/service targets and the "own system + API" flag to each requirement. Anything the model gets wrong becomes unknown / false, never an error. */
export async function classify(llm: Llm, reqs: RawReq[], k?: Ctx): Promise<RawReq[]> {
  const tx = k?.taxonomy ?? DEFAULT_TAXONOMY
  const out = await llm<{ items: { id: string; targets: unknown; wantsApi: unknown }[] }>({
    system: sys('classify', k),
    content: [{ type: 'text', text: ['Requirements:', ...reqs.map((r) => `- ${r.id} [${r.module}] ${r.text}`)].join('\n') }],
    tool: classifyTool(tx),
  })
  const byId = new Map((Array.isArray(out?.items) ? out.items : []).map((i) => [i.id, i]))
  return reqs.map((r) => {
    const i = byId.get(r.id)
    return { ...r, targets: cleanTargets(i?.targets, tx), wantsApi: i?.wantsApi === true }
  })
}

const API_REASON = 'ลูกค้าขอ API เพื่อสร้างระบบของตัวเอง ต้องถาม Tech ว่ารับได้ไหม หรือรอ KB อัปเดต'
const targetNameIn = (tx: Taxonomy) => (t: Target) => (t.service === UNKNOWN ? zoneLabel(t.zone, tx) : `${zoneLabel(t.zone, tx)} › ${serviceLabel(t.service, tx)}`)

/** Judge a batch of requirements against the KB notes retrieved for each. Requirements with targets only see the notes of their service(s). */
export async function judge(llm: Llm, reqs: RawReq[], kb: Note[], k?: Ctx): Promise<Req[]> {
  const targetName = targetNameIn(k?.taxonomy ?? DEFAULT_TAXONOMY)
  const retrieved = new Map(
    reqs.map((r) => [r.id, r.targets ? retrieveForTargets(kb, r.text, r.targets) : { notes: searchKb(kb, `${r.module} ${r.text}`), byTarget: new Map<Target, Note[]>() }]),
  )
  const notes = new Map([...retrieved.values()].flatMap((x) => x.notes).map((n) => [n.path, n]))
  const prompt = [
    'Requirements:',
    ...reqs.map((r) => {
      const targets = r.targets ? `\n  targets: ${r.targets.map(targetName).join(' | ')}` : ''
      return `- ${r.id} [${r.module}] ${r.text}${targets}\n  candidate notes: ${retrieved.get(r.id)!.notes.map((n) => n.path).join(', ') || '(none)'}`
    }),
    '',
    'Knowledge base notes:',
    ...[...notes.values()].map((n) => `### ${n.path} (support: ${n.support})\n${n.body}`),
  ].join('\n')

  const out = await llm<{ verdicts: Verdict[] }>({
    system: sys('judge', k),
    content: [{ type: 'text', text: prompt }],
    tool: JUDGE_TOOL,
  })

  const byId = new Map(out.verdicts.map((v) => [v.id, v]))
  return reqs.map((r): Req => {
    const v = byId.get(r.id)
    const { notes: candidates, byTarget } = retrieved.get(r.id)!
    const tag = { ...(r.targets && { targets: r.targets }), ...(r.wantsApi && { wantsApi: true }) }
    const cited = (v?.sources ?? []).map((p) => notes.get(p)).filter((n): n is Note => !!n)
    const titles = (ns: Note[]) => ns.map((n) => `KB › ${n.module} › ${n.title}`).join(' · ')

    // The customer builds their own system and wants an API: the model's opinion is not used, a person verifies.
    if (r.wantsApi) {
      return { id: r.id, module: r.module, text: r.text, ...tag, s: 'verify', conf: '0%', reason: API_REASON, evidence: candidates.length ? `ไม่ใช่หลักฐานยืนยัน ใช้ประกอบเท่านั้น: ${titles(candidates)}` : 'ไม่พบหลักฐานที่ตรงกัน', rec: API_REASON }
    }
    if (!v || !STATUSES.includes(v.s)) return { id: r.id, module: r.module, text: r.text, ...tag, s: 'verify', conf: '0%', reason: 'Model gave no valid verdict', evidence: 'ไม่พบหลักฐานที่ตรงกัน', rec: 'ตรวจสอบด้วยตนเอง' }

    const uncovered = r.targets ? r.targets.filter((t) => !byTarget.get(t)?.length) : []
    // Evidence grouped by target when there are targets; the old flat form otherwise.
    const evidence = r.targets
      ? r.targets.map((t) => { const hit = cited.filter((n) => byTarget.get(t)?.some((c) => c.path === n.path)); return `${targetName(t)}: ${hit.length ? titles(hit) : 'ไม่พบหลักฐานที่ตรงกัน'}` }).join(' | ')
      : cited.length ? titles(cited) : 'ไม่พบหลักฐานที่ตรงกัน'
    const noNote = uncovered.length > 0 // a target with no note at all can not be judged
    return {
      id: r.id, module: r.module, text: r.text, ...tag,
      s: noNote ? 'verify' : cited.length || v.s === 'verify' ? v.s : 'verify', // a verdict with no real KB source is not a verdict
      conf: `${Math.round(Math.min(1, Math.max(0, v.confidence)) * 100)}%`,
      reason: noNote ? `ไม่มี note ใน KB สำหรับ ${uncovered.map(targetName).join(', ')} — ${v.reason}` : v.reason,
      evidence,
      rec: v.rec,
    }
  })
}
