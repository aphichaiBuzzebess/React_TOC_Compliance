export type Block =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string } }

export interface Tool { name: string; description: string; schema: Record<string, unknown> }

/** One structured JSON answer for one request. Injected so tests can fake it. */
export type Llm = <T>(o: { system: string; content: Block[]; tool: Tool; maxTokens?: number }) => Promise<T>

export type Provider = 'anthropic' | 'gemini'
export const PROVIDERS: Provider[] = ['anthropic', 'gemini']

/** Supplied by the caller on every request. The server holds no AI keys and stores nothing. */
export interface LlmConfig { provider: Provider; apiKey: string; model: string }

/** SDKs load on first use so only the chosen one is paid for. */
export function createLlm(cfg: LlmConfig): Llm {
  return async (o) => {
    const llm = cfg.provider === 'gemini' ? (await import('./llm-gemini.js')).geminiLlm(cfg) : (await import('./llm-anthropic.js')).anthropicLlm(cfg)
    return llm(o)
  }
}
