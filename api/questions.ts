import { createLlm } from '../server/llm.js'
import { checkCoverage, loadTopics, pickPart } from '../server/questions.js'
import { handle, llmFromRequest } from '../server/http.js'
import type { RawReq } from '../src/lib/types.js'

const MAX_REQS = 300


export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => {
    const { requirements, part = 0, of = 1 } = (await req.json()) as { requirements?: RawReq[]; part?: number; of?: number }
    if (!Array.isArray(requirements) || requirements.length === 0 || requirements.length > MAX_REQS) throw new Error(`Send 1-${MAX_REQS} requirements`)
    if (!Number.isInteger(part) || !Number.isInteger(of) || of < 1 || of > 20 || part < 0 || part >= of) throw new Error('Bad part')
    const clean = requirements.map((r) => ({ id: String(r.id), module: String(r.module), text: String(r.text).slice(0, 1000) }))
    return { topics: await checkCoverage(createLlm(llmFromRequest(req)), clean, pickPart(loadTopics(), part, of)) }
  })
}
