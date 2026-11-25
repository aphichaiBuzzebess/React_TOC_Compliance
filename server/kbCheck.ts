import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { SERVICES, SOLUTIONS, findService, findSolution } from '../src/data/taxonomy.js'
import { kbDir, walk } from './kb.js'

const SUPPORT = ['full', 'config', 'custom', 'integ', 'none']

/** The closest known name to a typo, by shared characters; undefined when nothing is close. */
function nearest(input: string, names: string[]): string | undefined {
  const a = input.toLowerCase().replace(/\s+/g, '')
  const score = (n: string) => { const b = n.toLowerCase().replace(/\s+/g, ''); let i = 0; for (const c of a) if (b.includes(c)) i++; return i / Math.max(a.length, b.length) }
  const best = names.map((n) => [n, score(n)] as const).sort((x, y) => y[1] - x[1])[0]
  return best && best[1] >= 0.6 ? best[0] : undefined
}

/** Everything wrong with one note, in plain Thai. Empty = fine. The loader skips a broken note silently; this says why. */
export function checkNote(raw: string): string[] {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return ['ไม่มี frontmatter: ไฟล์ต้องขึ้นต้นด้วยบรรทัด --- แล้วตามด้วย title, service, support และปิดด้วย ---']
  const fm = Object.fromEntries(m[1].split(/\r?\n/).map((l) => l.split(/:\s*(.*)/).slice(0, 2)))
  const out: string[] = []
  if (!fm.title) out.push('ไม่มี title')
  if (!SUPPORT.includes(fm.support)) out.push(`support ต้องเป็นหนึ่งใน ${SUPPORT.join(' | ')} (ตอนนี้: "${fm.support ?? ''}")`)
  if (!fm.service) out.push(`ไม่มี service: ระบบจะไม่เอา note นี้ไปใช้ตอนประเมินตาม solution/service เลือกจาก ${SERVICES.map((s) => s.label).join(', ')}`)
  else if (!findService(fm.service)) {
    const hint = nearest(fm.service, SERVICES.map((s) => s.label))
    out.push(`service "${fm.service}" ไม่รู้จัก${hint ? ` ใกล้เคียง "${hint}"` : ''}`)
  }
  for (const z of (fm.solution ?? fm.zone ?? '').split(',').map((x: string) => x.trim()).filter(Boolean)) {
    if (!findSolution(z)) out.push(`solution "${z}" ไม่รู้จัก เลือกจาก ${SOLUTIONS.map((x) => x.label).join(', ')} (หรือไม่ใส่ = ใช้ได้ทุก solution)`)
  }
  if (!m[2].trim()) out.push('เนื้อหาว่าง')
  return out
}

export function checkKb(dir = kbDir()): { path: string; problems: string[] }[] {
  return walk(dir)
    .filter((f) => !/README\.md$/i.test(f))
    .map((f) => ({ path: relative(dir, f), problems: checkNote(readFileSync(f, 'utf8')) }))
    .filter((r) => r.problems.length)
}
