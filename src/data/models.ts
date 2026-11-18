export type ProviderId = 'anthropic' | 'gemini'

export const AI_PROVIDERS: { id: ProviderId; label: string; keyLabel: string; models: string[] }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', keyLabel: 'Anthropic API key', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'] },
  { id: 'gemini', label: 'Gemini (Google)', keyLabel: 'Gemini API key', models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-4-argon', 'gemini-4-carbon'] },
]

export const defaultModel = (p: ProviderId) => AI_PROVIDERS.find((x) => x.id === p)!.models[0]
