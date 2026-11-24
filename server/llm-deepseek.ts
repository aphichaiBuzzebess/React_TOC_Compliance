import { chatLlm, textOnly, type Flavor } from './llm-openai.js'
import type { Llm, LlmConfig } from './llm.js'

// deepseek-chat answers at most 8K tokens; the reasoning model may think and answer longer.
const LIMIT = (model: string) => (model.includes('reasoner') ? 32000 : 8192)

const DEEPSEEK: Flavor = {
  name: 'DeepSeek',
  url: 'https://api.deepseek.com/chat/completions',
  limit: (model, n) => ({ max_tokens: Math.min(Math.max(n, 4000), LIMIT(model)) }),
  content: textOnly('DeepSeek'),
}

/** DeepSeek: OpenAI-compatible Chat Completions, text only. `fetcher` is injectable for tests. */
export const deepseekLlm = (cfg: LlmConfig, fetcher: typeof fetch = fetch): Llm => chatLlm(cfg, DEEPSEEK, fetcher)
