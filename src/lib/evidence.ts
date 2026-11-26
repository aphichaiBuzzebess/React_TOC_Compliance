/**
 * The KB notes a verdict cites, read back out of its evidence text. The judge writes them as "KB › <module> › <title>",
 * joined by " · ", and, per target, "<solution › service>: …" joined by " | ".
 */
export interface Feature { module: string; title: string }

const NOTE = /KB › ([^›·|]+?) › ([^·|]+)/g

export function features(evidence: string): Feature[] {
  const seen = new Set<string>()
  const out: Feature[] = []
  for (const m of evidence.matchAll(NOTE)) {
    const f = { module: m[1].trim(), title: m[2].trim() }
    const k = `${f.module}/${f.title}`
    if (!seen.has(k)) { seen.add(k); out.push(f) }
  }
  return out
}

/** The first cited note: the feature of ours the requirement maps to. */
export const featureOf = (evidence: string): Feature | undefined => features(evidence)[0]
