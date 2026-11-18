import { anthropicLlm } from '../server/llm'
import { extractRequirements, toBlocks } from '../server/pipeline'
import { handle } from '../server/http'

const MAX_BYTES = 4 * 1024 * 1024 // Vercel function bodies are capped at ~4.5 MB

export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => {
    const name = decodeURIComponent(req.headers.get('x-filename') ?? '')
    const bytes = Buffer.from(await req.arrayBuffer())
    if (!name || bytes.length === 0) throw new Error('Missing file')
    if (bytes.length > MAX_BYTES) throw new Error('File too large (max 4 MB)')
    return { requirements: await extractRequirements(anthropicLlm(), await toBlocks(name, bytes)) }
  })
}
