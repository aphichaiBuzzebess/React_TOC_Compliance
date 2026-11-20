import { HttpError } from '../server/auth.js'
import type { KbKind } from '../server/db.js'
import { accountMode } from '../server/db.js'
import { handle } from '../server/http.js'
import { importFromFiles, listDeleted, listVersions, loadView, removeNote, resetPrompt, restoreVersion, saveNote, savePrompt, saveTaxonomy } from '../server/knowledge.js'
import type { User } from '../server/db.js'

const q = (req: Request, name: string) => new URL(req.url).searchParams.get(name) ?? ''
const body = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
const token = (v: unknown) => (typeof v === 'string' ? v : null)

/** Anyone signed in may read; only an admin may write or see versions. Without accounts nobody can write. */
function requireAdmin(user: User | null): string {
  if (!accountMode()) throw new HttpError(403, 'ต้องเปิดระบบบัญชีและเป็น admin')
  if (!user?.isAdmin) throw new HttpError(403, 'เฉพาะ admin เท่านั้นที่แก้ได้')
  return user.username
}

// Notes, taxonomy and prompts of the knowledge base, editable by admins. ?part=notes|taxonomy|prompts|versions|import|restore
export async function GET(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    const part = q(req, 'part')
    if (part === 'versions') {
      requireAdmin(user)
      const kind = q(req, 'kind') as KbKind
      if (!['note', 'prompt', 'taxonomy'].includes(kind)) throw new HttpError(400, 'kind ไม่ถูกต้อง')
      if (q(req, 'deleted')) return { deleted: await listDeleted() }
      return { versions: await listVersions(kind, q(req, 'key')) }
    }
    const v = await loadView()
    if (part === 'notes') return { status: v.status, notes: v.notes }
    if (part === 'taxonomy') return { status: v.status, taxonomy: v.taxonomy, updatedAt: v.taxonomyUpdatedAt }
    if (part === 'prompts') return { status: v.status, prompts: v.prompts }
    throw new HttpError(400, 'part ไม่ถูกต้อง')
  })
}

export async function POST(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    const by = requireAdmin(user)
    const part = q(req, 'part')
    const b = await body(req)
    if (part === 'notes') return saveNote(by, { ...b, path: undefined })
    if (part === 'import') return importFromFiles(by)
    if (part === 'restore') return restoreVersion(by, Number(b.id), token(b.updatedAt))
    throw new HttpError(400, 'part ไม่ถูกต้อง')
  })
}

export async function PUT(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    const by = requireAdmin(user)
    const part = q(req, 'part')
    const b = await body(req)
    if (part === 'notes') {
      if (typeof b.path !== 'string') throw new HttpError(400, 'ต้องระบุ path')
      return saveNote(by, b as { path: string })
    }
    if (part === 'taxonomy') return saveTaxonomy(by, b.taxonomy, token(b.updatedAt))
    if (part === 'prompts') return savePrompt(by, q(req, 'key'), b.body, token(b.updatedAt))
    throw new HttpError(400, 'part ไม่ถูกต้อง')
  })
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req, async (user) => {
    const by = requireAdmin(user)
    const part = q(req, 'part')
    if (part === 'notes') return removeNote(by, q(req, 'path'), q(req, 'updatedAt'))
    if (part === 'prompts') return resetPrompt(by, q(req, 'key'), q(req, 'updatedAt'))
    throw new HttpError(400, 'part ไม่ถูกต้อง')
  })
}
