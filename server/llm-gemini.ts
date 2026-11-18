import { GoogleGenAI } from '@google/genai'
import type { Block, Llm, LlmConfig } from './llm.js'

export const toParts = (blocks: Block[]) =>
  blocks.map((b) => (b.type === 'text' ? { text: b.text } : { inlineData: { mimeType: b.source.media_type, data: b.source.data } }))

/** JSON even if the model wrapped it in a code fence or added a sentence around it. */
export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(t)
  } catch {
    const a = t.indexOf('{')
    const b = t.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1))
    throw new Error('not JSON')
  }
}

// Thinking models spend part of the output limit on reasoning, and Thai text is token-heavy,
// so the visible answer gets cut off unless the limit is generous.
const FLOOR = 32768
const CEILING = 65536

export function geminiLlm({ apiKey, model }: LlmConfig): Llm {
  const ai = new GoogleGenAI({ apiKey })
  return async ({ system, content, tool, maxTokens = 8000 }) => {
    let limit = Math.max(maxTokens, FLOOR)
    let finish = 'unknown'
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: toParts(content) }],
        config: { systemInstruction: `${system}\n\n${tool.description}`, responseMimeType: 'application/json', responseJsonSchema: tool.schema, maxOutputTokens: limit },
      })
      finish = String(res.candidates?.[0]?.finishReason ?? 'unknown')
      if (res.text) {
        try {
          return parseJson(res.text) as never
        } catch {
          /* fall through to retry */
        }
      }
      if (finish === 'MAX_TOKENS') limit = Math.min(limit * 2, CEILING) // cut off: allow a longer answer
    }
    throw new Error(`Model returned invalid JSON after 3 tries (finish reason: ${finish}). Try a different model.`)
  }
}
