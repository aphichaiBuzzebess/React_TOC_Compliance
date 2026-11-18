import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { StatusKey } from '../src/lib/types'

export interface Note {
  path: string // relative to the vault, e.g. member/registration-channels.md
  title: string
  module: string
  support: StatusKey
  updated: string
  body: string
}

const SUPPORT = new Set<string>(['full', 'config', 'custom', 'integ', 'none'])

export const kbDir = () => process.env.KB_DIR ?? join(process.cwd(), 'kb')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.')) return [] // .obsidian etc.
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : e.name.endsWith('.md') ? [p] : []
  })
}

export function parseNote(path: string, raw: string): Note | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return null
  const fm = Object.fromEntries(m[1].split('\n').map((l) => l.split(/:\s*(.*)/).slice(0, 2)))
  if (!fm.title || !fm.module || !SUPPORT.has(fm.support)) return null // README and malformed notes are skipped
  return { path, title: fm.title, module: fm.module, support: fm.support as StatusKey, updated: fm.updated ?? '', body: m[2].trim() }
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
