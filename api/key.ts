import { HttpError } from '../server/auth.js'
import { getDb } from '../server/db.js'
import { handle } from '../server/http.js'
import { PROVIDERS, type Provider } from '../server/llm.js'
import { encryptKey } from '../server/vault.js'

// The stored AI key of the signed-in user. Responses carry the provider, model and last 4 characters, never the key.
export async function GET(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    const row = user && (await (await getDb()).getKey(user.id))
    return row ? { provider: row.provider, model: row.model, last4: row.last4 } : null
  })
}

export async function PUT(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    const b = (await req.json().catch(() => ({}))) as { provider?: string; model?: string; key?: string }
    const provider = String(b.provider ?? '').toLowerCase()
    const model = String(b.model ?? '').trim()
    const key = String(b.key ?? '').trim()
    if (!PROVIDERS.includes(provider as Provider)) throw new HttpError(400, 'Choose an AI provider (anthropic or gemini)')
    if (!key) throw new HttpError(400, 'Enter your API key')
    if (key.length > 512) throw new HttpError(400, 'API key is too long')
    if (!/^[A-Za-z0-9._:/-]{1,100}$/.test(model)) throw new HttpError(400, 'Choose a model')
    const enc = encryptKey(user.id, key)
    const last4 = key.slice(-4)
    await (await getDb()).saveKey(user.id, { provider, model, ...enc, last4 })
    return { provider, model, last4 }
  })
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    if (!user) throw new HttpError(401, 'login')
    await (await getDb()).deleteKey(user.id)
    return { ok: true }
  })
}
