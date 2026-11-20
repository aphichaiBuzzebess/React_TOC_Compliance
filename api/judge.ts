import { createLlm } from '../server/llm.js'
import { loadKb } from '../server/kb.js'
import { judge } from '../server/pipeline.js'
import { handle, llmFromRequest } from '../server/http.js'
import { cleanTargets } from '../src/data/taxonomy.js'
import type { RawReq } from '../src/lib/types.js'

const MAX_BATCH = 15

export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => {
    const { requirements } = (await req.json()) as { requirements?: RawReq[] }
    if (!Array.isArray(requirements) || requirements.length === 0 || requirements.length > MAX_BATCH) throw new Error(`Send 1-${MAX_BATCH} requirements`)
    const clean = requirements.map((r) => ({ id: String(r.id), module: String(r.module), text: String(r.text).slice(0, 1000), ...(r.targets !== undefined && { targets: cleanTargets(r.targets) }), ...(r.wantsApi === true && { wantsApi: true }) }))
    return { results: await judge(createLlm(await llmFromRequest(req)), clean, loadKb()) }
  })
}
