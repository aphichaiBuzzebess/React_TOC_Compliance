import { chatLlm, type Flavor } from './llm-openai.js'
import type { Llm, LlmConfig } from './llm.js'

// deepseek-chat answers at most 8K tokens; the reasoning model may think and answer longer.
const LIMIT = (model: string) => (model.includes('reasoner') ? 32000 : 8192)

const DEEPSEEK: Flavor = {
  name: 'DeepSeek',
  url: 'https://api.deepseek.com/chat/completions',
  limit: (model, n) => ({ max_tokens: Math.min(Math.max(n, 4000), LIMIT(model)) }),
  // DeepSeek reads text only: a PDF or an image is refused with a message the BA can act on, before anything is sent.
  content: (blocks) =>
    blocks.map((b) => {
      if (b.type !== 'text') throw new Error('DeepSeek อ่านได้เฉพาะข้อความ: ใช้ไฟล์ DOCX หรือ XLSX หรือเปลี่ยนไปใช้ Claude, Gemini หรือ ChatGPT สำหรับ PDF และรูปภาพ')
      return { type: 'text', text: b.text }
    }),
}

/** DeepSeek: OpenAI-compatible Chat Completions, text only. `fetcher` is injectable for tests. */
export const deepseekLlm = (cfg: LlmConfig, fetcher: typeof fetch = fetch): Llm => chatLlm(cfg, DEEPSEEK, fetcher)
