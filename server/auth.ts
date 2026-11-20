import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { accountMode, getDb, type User } from './db.js'

/** A message the caller may show, with the HTTP status to use. */
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const WINDOW = 15 * 60 * 1000
const SESSION_DAYS = 14
const COOKIE = 'ts_session'
const USERNAME = /^[a-z0-9._@+-]{3,100}$/ // an email address fits
const N = 32768 // scrypt cost: about 100 ms per hash
const hex = (b: Buffer) => b.toString('hex')

const scryptAsync = (pw: string, salt: Buffer, n: number) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, { N: n, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))))

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$${N}$8$1$${hex(salt)}$${hex(await scryptAsync(pw, salt, N))}`
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, , , salt, hash] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const want = Buffer.from(hash, 'hex')
  const got = await scryptAsync(pw, Buffer.from(salt, 'hex'), Number(n))
  return got.length === want.length && timingSafeEqual(got, want)
}

let dummy: Promise<string> | undefined
/** Verified against when the user does not exist, so unknown names cost the same time as wrong passwords. */
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password'))

export const normalizeUsername = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '')

function validate(username: string, password: unknown) {
  if (!USERNAME.test(username)) throw new HttpError(400, 'ชื่อผู้ใช้ต้องยาว 3-100 ตัว ใช้ a-z 0-9 . _ @ + - เท่านั้น (ใช้อีเมลได้)')
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new HttpError(400, 'รหัสผ่านต้องยาว 10-200 ตัวอักษร')
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

function cookieToken(req: Request): string | undefined {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=') || undefined
  }
}

/** Set-Cookie value that starts (token) or ends (null) a session. Secure everywhere except localhost. */
export function sessionCookie(req: Request, token: string | null): string {
  const host = new URL(req.url).hostname
  const secure = host === 'localhost' || host === '127.0.0.1' ? '' : '; Secure'
  return `${COOKIE}=${token ?? ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? SESSION_DAYS * 86400 : 0}${secure}`
}

export async function currentUser(req: Request): Promise<User | null> {
  const token = cookieToken(req)
  if (!token || !accountMode()) return null
  return (await (await getDb()).sessionUser(tokenHash(token))) ?? null
}

async function startSession(user: User): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await (await getDb()).createSession(tokenHash(token), user.id, new Date(Date.now() + SESSION_DAYS * 86400_000))
  return token
}

/** Sign-up needs the team code. It fails closed: with no code configured it is open only on a local machine (no VERCEL_ENV). */
export async function signUp(req: Request, body: { username?: unknown; password?: unknown; code?: unknown }): Promise<{ user: User; token: string }> {
  const db = await getDb()
  const ip = `signup:ip:${clientIp(req)}`
  if ((await db.failures(ip, WINDOW)) >= 5 || (await db.failures('signup:all', WINDOW)) >= 50) throw new HttpError(429, 'ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่')
  const want = process.env.ACCESS_CODE
  if (!want && process.env.VERCEL_ENV) throw new HttpError(403, 'ยังสมัครไม่ได้: ผู้ดูแลระบบยังไม่ได้ตั้งรหัสทีม')
  if (want) {
    const given = Buffer.from(typeof body.code === 'string' ? body.code : '')
    const w = Buffer.from(want)
    if (given.length !== w.length || !timingSafeEqual(given, w)) {
      await db.bump(ip, WINDOW)
      await db.bump('signup:all', WINDOW)
      throw new HttpError(403, 'รหัสทีมไม่ถูกต้อง')
    }
  }
  const username = normalizeUsername(body.username)
  validate(username, body.password)
  const user = await db.createUser(username, await hashPassword(body.password as string))
  if (!user) throw new HttpError(409, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว')
  return { user, token: await startSession(user) }
}

export async function logIn(req: Request, body: { username?: unknown; password?: unknown }): Promise<{ user: User; token: string }> {
  const db = await getDb()
  const username = normalizeUsername(body.username)
  const kUser = `login:user:${username}`
  const kIp = `login:ip:${clientIp(req)}`
  if ((await db.failures(kUser, WINDOW)) >= 5 || (await db.failures(kIp, WINDOW)) >= 20) throw new HttpError(429, 'ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่')
  const user = await db.userByName(username)
  const ok = await verifyPassword(typeof body.password === 'string' ? body.password : '', user?.passwordHash ?? (await dummyHash()))
  if (!user || user.disabled || !ok) {
    await db.bump(kUser, WINDOW)
    await db.bump(kIp, WINDOW)
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
  }
  await db.clearAttempts(kUser)
  await db.clearAttempts(kIp)
  return { user, token: await startSession(user) }
}

export async function logOut(req: Request): Promise<void> {
  const token = cookieToken(req)
  if (token && accountMode()) await (await getDb()).deleteSession(tokenHash(token))
}

/** Changing the password ends every other session of that user. */
export async function changePassword(req: Request, user: User, body: { current?: unknown; password?: unknown }): Promise<void> {
  if (!(await verifyPassword(typeof body.current === 'string' ? body.current : '', user.passwordHash))) throw new HttpError(401, 'รหัสผ่านปัจจุบันไม่ถูกต้อง')
  validate(user.username, body.password)
  const db = await getDb()
  await db.setPassword(user.id, await hashPassword(body.password as string))
  const token = cookieToken(req)
  await db.deleteUserSessions(user.id, token ? tokenHash(token) : undefined)
}
