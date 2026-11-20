import { handle, keySource, llmFromRequest, serverDefault } from '../server/http.js'
import { pingProvider } from '../server/status.js'

// GET: which AI the server offers by default (never the key), so the page can skip asking for one.
export async function GET(req: Request): Promise<Response> {
  return handle(req, async () => {
    const d = serverDefault()
    return { default: d ? { provider: d.provider, model: d.model } : null, ...(await keySource(req)) }
  })
}

// POST: one small real call with the caller's own key (or the default) to confirm it works. Costs a few tokens.
export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => pingProvider(await llmFromRequest(req)))
}
