import Anthropic from '@anthropic-ai/sdk'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

export interface Tool { name: string; description: string; schema: Record<string, unknown> }

/** One forced tool call = one structured JSON answer. Injected so tests can fake it. */
export type Llm = <T>(o: { system: string; content: Block[]; tool: Tool; maxTokens?: number }) => Promise<T>

export function anthropicLlm(): Llm {
  const client = new Anthropic() // reads ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'
  return async ({ system, content, tool, maxTokens = 8000 }) => {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name: tool.name },
    })
    const use = res.content.find((b) => b.type === 'tool_use')
    if (!use || use.type !== 'tool_use') throw new Error('Model returned no structured answer')
    return use.input as never
  }
}
