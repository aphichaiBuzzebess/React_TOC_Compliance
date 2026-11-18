import { timingSafeEqual } from 'node:crypto'
import { PROVIDERS, type LlmConfig, type Provider } from './llm.js'

const json = (body: unknown, status = 200) => Response.json(body, { status })

/** Optional shared code. If the operator sets ACCESS_CODE, every endpoint requires it; if not, the site is open. */
export function guard(req: Request): Response | null {
  const code = process.env.ACCESS_CODE
  if (!code) return null
  const given = Buffer.from(req.headers.get('x-access-code') ?? '')
  const want = Buffer.from(code)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return json({ error: 'Invalid access code' }, 401)
  return null
}

/** The caller's own provider, model and key, read from headers for this one request. Never stored or logged. */
export function llmFromRequest(req: Request): LlmConfig {
  const provider = (req.headers.get('x-llm-provider') ?? '').toLowerCase()
  const apiKey = (req.headers.get('x-llm-key') ?? '').trim()
  const model = (req.headers.get('x-llm-model') ?? '').trim()
  if (!PROVIDERS.includes(provider as Provider)) throw new Error('Choose an AI provider (anthropic or gemini)')
  if (!apiKey) throw new Error('Enter your API key in AI settings')
  if (apiKey.length > 512) throw new Error('API key is too long')
  if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)) throw new Error('Choose a model')
  return { provider: provider as Provider, apiKey, model }
}

/** Provider errors can echo request details; keep the caller's key out of responses and logs. */
export const redact = (msg: string, key: string) => (key.length >= 8 ? msg.split(key).join('***') : msg).slice(0, 300)

/** SDKs often wrap the provider's JSON in the message ("401 {...}"); show just the readable part. */
export function errorMessage(e: unknown, key: string): string {
  const raw = e instanceof Error ? e.message : 'Unexpected error'
  const i = raw.indexOf('{')
  if (i >= 0) {
    try {
      const j = JSON.parse(raw.slice(i))
      const inner = j?.error?.message ?? j?.message
      if (typeof inner === 'string') return redact(`${raw.slice(0, i).trim()} ${inner}`.trim(), key)
    } catch {
      /* not JSON: fall through */
    }
  }
  return redact(raw, key)
}

export async function handle(req: Request, run: () => Promise<unknown>): Promise<Response> {
  const denied = guard(req)
  if (denied) return denied
  try {
    return json(await run())
  } catch (e) {
    const msg = errorMessage(e, req.headers.get('x-llm-key') ?? '')
    console.error(msg) // message only, never the error object (it may carry request headers)
    return json({ error: msg }, 400)
  }
}
