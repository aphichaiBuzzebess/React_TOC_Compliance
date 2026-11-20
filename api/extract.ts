import { createLlm } from '../server/llm.js'
import { extractRequirements, toBlocks } from '../server/pipeline.js'
import { handle, llmFromRequest } from '../server/http.js'
import { loadKnowledge } from '../server/knowledge.js'

const MAX_BYTES = 4 * 1024 * 1024 // Vercel function bodies are capped at ~4.5 MB

export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => {
    const name = decodeURIComponent(req.headers.get('x-filename') ?? '')
    const bytes = Buffer.from(await req.arrayBuffer())
    if (!name || bytes.length === 0) throw new Error('Missing file')
    if (bytes.length > MAX_BYTES) throw new Error('File too large (max 4 MB)')
    return { requirements: await extractRequirements(createLlm(await llmFromRequest(req)), await toBlocks(name, bytes), await loadKnowledge()) }
  })
}
