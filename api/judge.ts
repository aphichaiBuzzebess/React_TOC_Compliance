import { createLlm } from '../server/llm'
import { loadKb } from '../server/kb'
import { judge } from '../server/pipeline'
import { handle } from '../server/http'
import type { RawReq } from '../src/lib/types'

const MAX_BATCH = 15

export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => {
    const { requirements } = (await req.json()) as { requirements?: RawReq[] }
    if (!Array.isArray(requirements) || requirements.length === 0 || requirements.length > MAX_BATCH) throw new Error(`Send 1-${MAX_BATCH} requirements`)
    const clean = requirements.map((r) => ({ id: String(r.id), module: String(r.module), text: String(r.text).slice(0, 1000) }))
    return { results: await judge(createLlm(), clean, loadKb()) }
  })
}
