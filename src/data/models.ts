export type ProviderId = 'anthropic' | 'gemini' | 'openai' | 'deepseek' | 'byteplus'

export const AI_PROVIDERS: { id: ProviderId; label: string; keyLabel: string; models: string[]; textOnly?: boolean }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', keyLabel: 'Anthropic API key', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'] },
  { id: 'gemini', label: 'Gemini (Google)', keyLabel: 'Gemini API key', models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-4-argon', 'gemini-4-carbon'] },
  { id: 'openai', label: 'ChatGPT (OpenAI)', keyLabel: 'OpenAI API key', models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'] },
  { id: 'deepseek', label: 'DeepSeek', keyLabel: 'DeepSeek API key', models: ['deepseek-chat', 'deepseek-reasoner'], textOnly: true },
  { id: 'byteplus', label: 'BytePlus ModelArk', keyLabel: 'BytePlus ModelArk API key', models: ['deepseek-v4-1-flash-261017'], textOnly: true },
]

export const defaultModel = (p: ProviderId) => AI_PROVIDERS.find((x) => x.id === p)!.models[0]
