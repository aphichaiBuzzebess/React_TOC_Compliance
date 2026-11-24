import { chatLlm, textOnly, type Flavor } from './llm-openai.js'
import type { Llm, LlmConfig } from './llm.js'

// BytePlus ModelArk hosts GLM (Zhipu) behind an OpenAI-compatible endpoint. Its image/PDF support is unverified, so it is treated as text only.
const BYTEPLUS: Flavor = {
  name: 'BytePlus',
  url: 'https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions',
  limit: (_model, n) => ({ max_tokens: Math.min(Math.max(n, 4000), 8192) }),
  content: textOnly('BytePlus (GLM)'),
}

/** BytePlus ModelArk (GLM): OpenAI-compatible Chat Completions, text only. `fetcher` is injectable for tests. */
export const byteplusLlm = (cfg: LlmConfig, fetcher: typeof fetch = fetch): Llm => chatLlm(cfg, BYTEPLUS, fetcher)
