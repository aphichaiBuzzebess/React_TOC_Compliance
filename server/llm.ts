export type Block =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

export interface Tool { name: string; description: string; schema: Record<string, unknown> }

/** One structured JSON answer for one request. Injected so tests can fake it. */
export type Llm = <T>(o: { system: string; content: Block[]; tool: Tool; maxTokens?: number }) => Promise<T>

export type Provider = 'anthropic' | 'gemini'
export const PROVIDERS: Provider[] = ['anthropic', 'gemini']
export const KEY_ENV: Record<Provider, string> = { anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' }

export const modelFor = (p: Provider) => (p === 'gemini' ? process.env.GEMINI_MODEL ?? 'gemini-3.8-flash' : process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5')

/** LLM_PROVIDER=anthropic (default) or gemini. */
export function activeProvider(): Provider {
  const p = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase()
  if (p !== 'anthropic' && p !== 'gemini') throw new Error(`Unknown LLM_PROVIDER "${p}" (use anthropic or gemini)`)
  return p
}

/** SDKs load on first use so only the chosen one is paid for. */
export function createLlm(provider: Provider = activeProvider()): Llm {
  return async (o) => {
    const llm = provider === 'gemini' ? (await import('./llm-gemini')).geminiLlm() : (await import('./llm-anthropic')).anthropicLlm()
    return llm(o)
  }
}
