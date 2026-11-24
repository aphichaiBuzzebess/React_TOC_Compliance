import type { Block, Llm, LlmConfig } from './llm.js'

// Reasoning models count their thinking against the output limit, and Thai text is token-heavy.
const FLOOR = 16000

/** What differs between OpenAI and the providers that copy its Chat Completions API (DeepSeek). */
export interface Flavor {
  name: string
  url: string
  /** The output-limit fields of the request body for the caller's `maxTokens`. */
  limit: (model: string, maxTokens: number) => Record<string, number>
  /** Our blocks as message content; may refuse what the provider cannot read. */
  content: (blocks: Block[]) => unknown
}

/** Our content blocks as Chat Completions parts: text, images as data URLs, PDFs as an inline file. */
export const toContent = (blocks: Block[]) =>
  blocks.map((b) =>
    b.type === 'text' ? { type: 'text', text: b.text }
    : b.type === 'image' ? { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
    : { type: 'file', file: { filename: 'tor.pdf', file_data: `data:${b.source.media_type};base64,${b.source.data}` } },
  )

const OPENAI: Flavor = { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', limit: (_m, n) => ({ max_completion_tokens: Math.max(n, FLOOR) }), content: toContent }

/** The answer is forced through one function call, like the other providers. `fetcher` is injectable for tests. */
export function chatLlm({ apiKey, model }: LlmConfig, flavor: Flavor, fetcher: typeof fetch = fetch): Llm {
  return async ({ system, content, tool, maxTokens = 8000 }) => {
    const res = await fetcher(flavor.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        ...flavor.limit(model, maxTokens),
        messages: [{ role: 'system', content: system }, { role: 'user', content: flavor.content(content) }],
        tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.schema } }],
        tool_choice: { type: 'function', function: { name: tool.name } },
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] }
    if (!res.ok) throw new Error(`${res.status} ${json.error?.message ?? `${flavor.name} request failed`}`)
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
    if (!args) throw new Error('Model returned no structured answer')
    try {
      return JSON.parse(args) as never
    } catch {
      throw new Error('Model returned invalid JSON. Try a different model.')
    }
  }
}

/** ChatGPT (OpenAI). */
export const openaiLlm = (cfg: LlmConfig, fetcher: typeof fetch = fetch): Llm => chatLlm(cfg, OPENAI, fetcher)
