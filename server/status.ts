import type { PingResult, StatusInfo } from '../src/lib/types'
import { activeProvider, createLlm, KEY_ENV, modelFor, PROVIDERS, type Llm, type Provider } from './llm'

/** Which provider is active and whether each has a key. Values are never returned. */
export function providerStatus(): StatusInfo {
  const providers = PROVIDERS.map((id) => ({ id, keySet: !!process.env[KEY_ENV[id]], model: modelFor(id), envVar: KEY_ENV[id] }))
  try {
    return { active: activeProvider(), providers }
  } catch (e) {
    return { active: null, error: e instanceof Error ? e.message : 'Invalid LLM_PROVIDER', providers }
  }
}

const redact = (msg: string) =>
  Object.values(KEY_ENV)
    .map((n) => process.env[n])
    .filter((k): k is string => !!k && k.length >= 8)
    .reduce((m, k) => m.split(k).join('***'), msg)
    .slice(0, 300)

/** One tiny real call, so a wrong or expired key shows up here and not in the middle of a TOR run. */
export async function pingProvider(provider: Provider, llm: Llm = createLlm(provider)): Promise<PingResult> {
  if (!process.env[KEY_ENV[provider]]) return { ok: false, ms: 0, error: `${KEY_ENV[provider]} is not set` }
  const t0 = Date.now()
  try {
    await llm({
      system: 'Connectivity check. Answer with ok=true.',
      content: [{ type: 'text', text: 'ping' }],
      tool: { name: 'pong', description: 'Report that the service is reachable.', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } },
      maxTokens: 256,
    })
    return { ok: true, ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: redact(e instanceof Error ? e.message : 'Request failed') }
  }
}

export const isProvider = (p: unknown): p is Provider => PROVIDERS.includes(p as Provider)
