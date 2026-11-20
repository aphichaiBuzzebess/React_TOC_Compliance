import type { Block, Llm, LlmConfig } from './llm.js'

const URL = 'https://api.openai.com/v1/chat/completions'
// Reasoning models count their thinking against the output limit, and Thai text is token-heavy.
const FLOOR = 16000

/** Our content blocks as Chat Completions parts: text, images as data URLs, PDFs as an inline file. */
export const toContent = (blocks: Block[]) =>
  blocks.map((b) =>
    b.type === 'text' ? { type: 'text', text: b.text }
    : b.type === 'image' ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
    : { type: 'file', file: { filename: 'tor.pdf', file_data: `data:${b.source.media_type};base64,${b.source.data}` } },
  )

/** ChatGPT (OpenAI): the answer is forced through one function call, like the other providers. `fetcher` is injectable for tests. */
export function openaiLlm({ apiKey, model }: LlmConfig, fetcher: typeof fetch = fetch): Llm {
  return async ({ system, content, tool, maxTokens = 8000 }) => {
    const res = await fetcher(URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        max_completion_tokens: Math.max(maxTokens, FLOOR),
        messages: [{ role: 'system', content: system }, { role: 'user', content: toContent(content) }],
        tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.schema } }],
        tool_choice: { type: 'function', function: { name: tool.name } },
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] }
    if (!res.ok) throw new Error(`${res.status} ${json.error?.message ?? 'OpenAI request failed'}`)
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
    if (!args) throw new Error('Model returned no structured answer')
    try {
      return JSON.parse(args) as never
    } catch {
      throw new Error('Model returned invalid JSON. Try a different model.')
    }
  }
}
