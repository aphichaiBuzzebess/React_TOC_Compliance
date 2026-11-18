import { GoogleGenAI } from '@google/genai'
import type { Block, Llm } from './llm'

export const toParts = (blocks: Block[]) =>
  blocks.map((b) => (b.type === 'text' ? { text: b.text } : { inlineData: { mimeType: b.source.media_type, data: b.source.data } }))

export function geminiLlm(): Llm {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  const ai = new GoogleGenAI({ apiKey })
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
  return async ({ system, content, tool, maxTokens = 8000 }) => {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: toParts(content) }],
      config: { systemInstruction: `${system}\n\n${tool.description}`, responseMimeType: 'application/json', responseJsonSchema: tool.schema, maxOutputTokens: maxTokens },
    })
    if (!res.text) throw new Error('Model returned no structured answer')
    try {
      return JSON.parse(res.text)
    } catch {
      throw new Error('Model returned invalid JSON (try again or use a larger GEMINI_MODEL)')
    }
  }
}
