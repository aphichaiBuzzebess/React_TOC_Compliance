import { GoogleGenAI } from '@google/genai'
import type { Block, Llm, LlmConfig } from './llm'

export const toParts = (blocks: Block[]) =>
  blocks.map((b) => (b.type === 'text' ? { text: b.text } : { inlineData: { mimeType: b.source.media_type, data: b.source.data } }))

export function geminiLlm({ apiKey, model }: LlmConfig): Llm {
  const ai = new GoogleGenAI({ apiKey })
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
      throw new Error('Model returned invalid JSON (try again or pick a larger model)')
    }
  }
}
