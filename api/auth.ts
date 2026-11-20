import { HttpError, changePassword, logIn, logOut, sessionCookie, signUp } from '../server/auth.js'
import { accountMode } from '../server/db.js'
import { handle } from '../server/http.js'

const me = (user: { username: string } | null) => ({ mode: 'account', user: user && { username: user.username } })

// GET: the page's first call. Which mode is the server in, and who is signed in. POST ?action=signup|login|logout|password.
export async function GET(req: Request): Promise<Response> {
  return handle(req, async (user) => (accountMode() ? me(user) : { mode: 'stateless', user: null }), { public: true })
}

export async function POST(req: Request): Promise<Response> {
  const action = new URL(req.url).searchParams.get('action')
  return handle(
    req,
    async (user) => {
      if (!accountMode()) throw new HttpError(400, 'ยังไม่ได้เปิดโหมดบัญชี')
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
      const withCookie = (u: { username: string }, token: string | null) =>
        Response.json(me(token ? u : null), { headers: { 'set-cookie': sessionCookie(req, token) } })
      if (action === 'signup') { const r = await signUp(req, body); return withCookie(r.user, r.token) }
      if (action === 'login') { const r = await logIn(req, body); return withCookie(r.user, r.token) }
      if (action === 'logout') { await logOut(req); return withCookie({ username: '' }, null) }
      if (action === 'password') {
        if (!user) throw new HttpError(401, 'login')
        await changePassword(req, user, body)
        return { ok: true }
      }
      throw new HttpError(400, 'Unknown action')
    },
    { public: true },
  )
}
