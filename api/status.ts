import { handle } from '../server/http'
import { isProvider, pingProvider, providerStatus } from '../server/status'

// GET: which provider is active and whether keys are set (no call to the model).
export async function GET(req: Request): Promise<Response> {
  return handle(req, async () => providerStatus())
}

// POST {provider}: one small real call to confirm the key works. Costs a few tokens.
export async function POST(req: Request): Promise<Response> {
  return handle(req, async () => {
    const { provider } = (await req.json().catch(() => ({}))) as { provider?: unknown }
    if (!isProvider(provider)) throw new Error('provider must be anthropic or gemini')
    return pingProvider(provider)
  })
}
