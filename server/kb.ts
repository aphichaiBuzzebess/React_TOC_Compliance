import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { StatusKey } from '../src/lib/types.js'
import { UNKNOWN, SERVICES, findService, findZone, type Target } from '../src/data/taxonomy.js'

export interface Note {
  path: string // relative to the vault, e.g. member/registration-channels.md
  title: string
  module: string
  support: StatusKey
  updated: string
  body: string
  service?: string // taxonomy service id this capability belongs to
  zone?: string[] // zones it is limited to; absent = every zone
}

const SUPPORT = new Set<string>(['full', 'config', 'custom', 'integ', 'none'])

export const kbDir = () => process.env.KB_DIR ?? join(process.cwd(), 'kb')

export function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name.startsWith('_')) return [] // .obsidian, and _template.md: not notes
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : e.name.endsWith('.md') ? [p] : []
  })
}

export function parseNote(path: string, raw: string): Note | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const fm = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s*(.*)/).slice(0, 2)))
  const service = typeof fm.service === 'string' ? findService(fm.service) : undefined
  // `module` is optional when there is a service: it defaults to the service's name.
  const module = fm.module || SERVICES.find((x) => x.id === service)?.label
  if (!fm.title || !module || !SUPPORT.has(fm.support)) return null // README and malformed notes are skipped (kb:check says why)
  const zone = typeof fm.zone === 'string' ? (fm.zone as string).split(',').map((z) => findZone(z)).filter((z): z is string => !!z) : []
  return { path, title: fm.title, module, support: fm.support as StatusKey, updated: fm.updated ?? '', body: m[2].trim(), ...(service && { service }), ...(zone.length && { zone }) }
}

export function loadKb(dir = kbDir()): Note[] {
  return walk(dir)
    .map((f) => parseNote(relative(dir, f), readFileSync(f, 'utf8')))
    .filter((n): n is Note => n !== null)
}

const seg = new Intl.Segmenter(['th', 'en'], { granularity: 'word' })
const tokens = (s: string) => [...seg.segment(s.toLowerCase())].filter((x) => x.isWordLike && x.segment.length > 1).map((x) => x.segment)

/** tf-idf over title/module/body; title and module count triple. */
export function searchKb(notes: Note[], query: string, limit = 4): Note[] {
  const docs = notes.map((n) => ({ n, t: tokens(`${n.title} ${n.module} ${n.title} ${n.module} ${n.title} ${n.module} ${n.body}`) }))
  const q = [...new Set(tokens(query))]
  const scored = docs.map(({ n, t }) => {
    let score = 0
    for (const w of q) {
      const tf = t.filter((x) => x === w).length
      if (!tf) continue
      const df = docs.filter((d) => d.t.includes(w)).length
      score += tf * Math.log(1 + docs.length / df)
    }
    return { n, score }
  })
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.n)
}

/** The notes that can answer one target: same service (and zone, when the note is zone-limited); a zone-only target takes the notes tagged with that zone and no service. */
export function poolFor(kb: Note[], t: Target): Note[] {
  if (t.service !== UNKNOWN) return kb.filter((n) => n.service === t.service && (!n.zone || n.zone.includes(t.zone)))
  if (t.zone !== UNKNOWN) return kb.filter((n) => !n.service && n.zone?.includes(t.zone))
  return []
}

/** Candidate notes per target, ranked by the requirement text. A pool that tf-idf cannot rank is still returned (the service match is the evidence). */
export function retrieveForTargets(kb: Note[], text: string, targets: Target[]): { notes: Note[]; byTarget: Map<Target, Note[]> } {
  const byTarget = new Map<Target, Note[]>()
  for (const t of targets) {
    const pool = poolFor(kb, t)
    const ranked = searchKb(pool, text)
    byTarget.set(t, ranked.length ? ranked : pool.slice(0, 4))
  }
  return { notes: [...new Map([...byTarget.values()].flat().map((n) => [n.path, n])).values()], byTarget }
}
