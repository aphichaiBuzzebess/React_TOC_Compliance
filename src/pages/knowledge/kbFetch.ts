import { authHeaders, useAssessmentStore } from '@/store/useAssessmentStore'

export class KbError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** A call to /api/knowledge. Reads need nothing special; writes carry the CSRF header (via authHeaders in account mode). */
export async function kb<T = Record<string, unknown>>(part: string, o: { method?: string; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const q = new URLSearchParams({ part, ...(o.query ?? {}) })
  const res = await fetch(`/api/knowledge?${q}`, {
    method: o.method ?? 'GET',
    headers: { ...authHeaders(useAssessmentStore.getState()), ...(o.body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && useAssessmentStore.getState().mode === 'account') useAssessmentStore.getState().expireSession()
  if (!res.ok) throw new KbError(res.status, json.error ?? `Request failed (${res.status})`)
  return json as T
}

export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '')
export const INPUT = 'w-full rounded-lg border border-line-strong px-[11px] text-sm'
