import { createLlm } from '../server/llm'
import { checkCoverage, loadTopics } from '../server/questions'
import { handle, llmFromRequest } from '../server/http'
import type { RawReq } from '../src/lib/types'

const MAX_REQS = 300

export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => {
    const { requirements } = (await req.json()) as { requirements?: RawReq[] }
    if (!Array.isArray(requirements) || requirements.length === 0 || requirements.length > MAX_REQS) throw new Error(`Send 1-${MAX_REQS} requirements`)
    const clean = requirements.map((r) => ({ id: String(r.id), module: String(r.module), text: String(r.text).slice(0, 1000) }))
    return { topics: await checkCoverage(createLlm(llmFromRequest(req)), clean, loadTopics()) }
  })
}
