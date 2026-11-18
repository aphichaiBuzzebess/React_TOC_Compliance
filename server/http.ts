import { timingSafeEqual } from 'node:crypto'

const json = (body: unknown, status = 200) => Response.json(body, { status })

/** Shared guard: these endpoints spend API credits, so they need the access code. */
export function guard(req: Request): Response | null {
  const code = process.env.ACCESS_CODE
  if (!code) return json({ error: 'Server not configured (ACCESS_CODE)' }, 503)
  const given = Buffer.from(req.headers.get('x-access-code') ?? '')
  const want = Buffer.from(code)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return json({ error: 'Invalid access code' }, 401)
  return null
}

export async function handle(req: Request, run: () => Promise<unknown>): Promise<Response> {
  const denied = guard(req)
  if (denied) return denied
  try {
    return json(await run())
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 400)
  }
}
