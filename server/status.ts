import type { PingResult } from '../src/lib/types.js'
import { createLlm, type Llm, type LlmConfig } from './llm.js'
import { errorMessage } from './http.js'

/** One tiny real call, so a wrong or expired key shows up here and not in the middle of a TOR run. */
export async function pingProvider(cfg: LlmConfig, llm: Llm = createLlm(cfg)): Promise<PingResult> {
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
    return { ok: false, ms: Date.now() - t0, error: errorMessage(e, cfg.apiKey) }
  }
}
