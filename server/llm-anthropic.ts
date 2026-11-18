import Anthropic from '@anthropic-ai/sdk'
import type { Llm, LlmConfig } from './llm.js'

export function anthropicLlm({ apiKey, model }: LlmConfig): Llm {
  const client = new Anthropic({ apiKey })
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
