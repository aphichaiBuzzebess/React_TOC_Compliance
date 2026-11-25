import { chatLlm, noPdf, type Flavor } from './llm-openai.js'
import type { Llm, LlmConfig } from './llm.js'

// BytePlus ModelArk hosts several vendors' models (DeepSeek, GLM…) behind one OpenAI-compatible endpoint. /api/v3 is the standard one;
// /api/coding/v3 is the coding-plan one and rejects other keys. Images go as image_url parts (DeepSeek V4.1 Flash is a vision model;
// a model that cannot see answers with an API error, which is shown as is). PDFs are refused: ModelArk's document input is not the
// Chat Completions file part, and is unverified.
const BYTEPLUS: Flavor = {
  name: 'BytePlus',
  url: 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
  limit: (_model, n) => ({ max_tokens: Math.min(Math.max(n, 4000), 8192) }),
  content: noPdf('BytePlus ModelArk'),
}

/** BytePlus ModelArk: OpenAI-compatible Chat Completions, text and images. `fetcher` is injectable for tests. */
export const byteplusLlm = (cfg: LlmConfig, fetcher: typeof fetch = fetch): Llm => chatLlm(cfg, BYTEPLUS, fetcher)
