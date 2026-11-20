import { timingSafeEqual } from 'node:crypto'
import { PROVIDERS, type LlmConfig, type Provider } from './llm.js'
import { defaultModel } from '../src/data/models.js'
import { HttpError, currentUser } from './auth.js'
import { accountMode, getDb, type User } from './db.js'
import { decryptKey } from './vault.js'

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

/** The operator's default AI, from LLM_PROVIDER plus <PROVIDER>_API_KEY and optional <PROVIDER>_MODEL (e.g. GEMINI_API_KEY).
 *  Opt-in by LLM_PROVIDER. A public production site without ACCESS_CODE ignores it, so nobody else can spend the operator's key. */
export function serverDefault(): LlmConfig | null {
  const provider = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase() as Provider
  if (!PROVIDERS.includes(provider)) return null
  if (!process.env.ACCESS_CODE && process.env.VERCEL_ENV === 'production') return null
  const P = provider.toUpperCase()
  const apiKey = (process.env[`${P}_API_KEY`] ?? '').trim()
  if (!apiKey) return null
  return { provider, apiKey, model: (process.env[`${P}_MODEL`] ?? '').trim() || defaultModel(provider) }
}

/** The key a request used, so that handle() can scrub it from error text without it ever being returned to a caller. */
const usedKey = new WeakMap<Request, string>()

/** Which AI the next request will use: a key sent in the header, else the signed-in user's stored key, else the operator's default. */
export async function llmFromRequest(req: Request): Promise<LlmConfig> {
  if (!(req.headers.get('x-llm-key') ?? '').trim()) {
    if (accountMode()) {
      const user = await currentUser(req)
      const row = user && (await (await getDb()).getKey(user.id))
      if (user && row) {
        try {
          const apiKey = decryptKey(user.id, row)
          usedKey.set(req, apiKey)
          return { provider: row.provider as Provider, apiKey, model: row.model }
        } catch {
          // Never fall back to the operator's key here: that would spend it without anyone choosing to.
          throw new Error('key ที่บันทึกไว้ใช้ไม่ได้ ใส่ API key ใหม่ที่หน้า AI settings')
        }
      }
    }
    const d = serverDefault()
    if (d) {
      usedKey.set(req, d.apiKey)
      return d
    }
  }
  const provider = (req.headers.get('x-llm-provider') ?? '').toLowerCase()
  const apiKey = (req.headers.get('x-llm-key') ?? '').trim()
  const model = (req.headers.get('x-llm-model') ?? '').trim()
  if (!PROVIDERS.includes(provider as Provider)) throw new Error('Choose an AI provider (anthropic or gemini)')
  if (!apiKey) throw new Error('Enter your API key in AI settings')
  if (apiKey.length > 512) throw new Error('API key is too long')
  if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)) throw new Error('Choose a model')
  usedKey.set(req, apiKey)
  return { provider: provider as Provider, apiKey, model }
}

/** For the status page: where the next run's key would come from. Never the key itself. */
export async function keySource(req: Request): Promise<{ keySource: 'header' | 'stored' | 'default' | 'none'; last4?: string }> {
  if ((req.headers.get('x-llm-key') ?? '').trim()) return { keySource: 'header' }
  if (accountMode()) {
    const user = await currentUser(req)
    const row = user && (await (await getDb()).getKey(user.id))
    if (row) return { keySource: 'stored', last4: row.last4 }
  }
  return { keySource: serverDefault() ? 'default' : 'none' }
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

/**
 * Wraps an endpoint. Stateless mode: the optional shared ACCESS_CODE. Account mode: a valid session (unless `public`),
 * and the CSRF header on anything that is not a GET. `run` may return a Response (to set cookies) or plain data.
 */
export async function handle(req: Request, run: (user: User | null) => Promise<unknown>, opts: { public?: boolean } = {}): Promise<Response> {
  let user: User | null = null
  if (accountMode()) {
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.get('x-requested-with') !== 'tor-scouter') return json({ error: 'Bad request' }, 403)
    user = await currentUser(req)
    if (!user && !opts.public) return json({ error: 'login' }, 401)
  } else {
    const denied = guard(req)
    if (denied) return denied
  }
  try {
    const out = await run(user)
    return out instanceof Response ? out : json(out)
  } catch (e) {
    const msg = errorMessage(e, usedKey.get(req) || req.headers.get('x-llm-key') || serverDefault()?.apiKey || '')
    console.error(msg) // message only, never the error object (it may carry request headers)
    return json({ error: msg }, e instanceof HttpError ? e.status : 400)
  }
}
