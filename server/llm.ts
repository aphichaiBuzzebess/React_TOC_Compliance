export type Block =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

export interface Tool { name: string; description: string; schema: Record<string, unknown> }

/** One structured JSON answer for one request. Injected so tests can fake it. */
export type Llm = <T>(o: { system: string; content: Block[]; tool: Tool; maxTokens?: number }) => Promise<T>

/** LLM_PROVIDER=anthropic (default) or gemini. SDKs load on first use so only the chosen one is paid for. */
export function createLlm(): Llm {
  const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase()
  if (provider !== 'anthropic' && provider !== 'gemini') throw new Error(`Unknown LLM_PROVIDER "${provider}" (use anthropic or gemini)`)
  return async (o) => {
    const llm = provider === 'gemini' ? (await import('./llm-gemini')).geminiLlm() : (await import('./llm-anthropic')).anthropicLlm()
    return llm(o)
  }
}
