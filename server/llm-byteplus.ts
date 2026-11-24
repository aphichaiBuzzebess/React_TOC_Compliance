import { chatLlm, textOnly, type Flavor } from './llm-openai.js'
import type { Llm, LlmConfig } from './llm.js'

// BytePlus ModelArk hosts several vendors' models (DeepSeek, GLM…) behind one OpenAI-compatible endpoint. /api/v3 is the standard one;
// /api/coding/v3 is the coding-plan one and rejects other keys. Image/PDF support is unverified, so it is treated as text only.
const BYTEPLUS: Flavor = {
  name: 'BytePlus',
  url: 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
  limit: (_model, n) => ({ max_tokens: Math.min(Math.max(n, 4000), 8192) }),
  content: textOnly('BytePlus ModelArk'),
}

/** BytePlus ModelArk (GLM): OpenAI-compatible Chat Completions, text only. `fetcher` is injectable for tests. */
export const byteplusLlm = (cfg: LlmConfig, fetcher: typeof fetch = fetch): Llm => chatLlm(cfg, BYTEPLUS, fetcher)
