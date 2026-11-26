/**
 * Buzzebees product taxonomy as data: where a requirement lands (solution) and which service/feature it uses.
 * Source: React_Internal_Process `src/content/reference/taxonomy.ts` (v5). Keep the two in step by hand.
 * The "extra" services were inferred from Azure resource names, not an official catalogue: `confirmed: false`.
 */
export interface Solution { id: string; label: string; hint: string; examples?: string[]; archived?: boolean }
export interface Service { id: string; label: string; hint: string; confirmed: boolean; examples?: string[]; archived?: boolean }
/** Solutions and services as data. Archived entries stay valid ids (old results, history and notes keep working) but are hidden from pickers and prompts. */
export interface Taxonomy { solutions: Solution[]; services: Service[] }
export interface Target { solution: string; service: string }

/**
 * "Solution" was called "zone" until Nov 2026. Data saved before that (history, the stored taxonomy and notes, version
 * history, a browser's saved state) still has the old key: read it as the new one. New data is always written with the new key.
 */
export function renamedKey(raw: unknown, from: string, to: string): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !(from in raw) || to in raw) return raw
  const { [from]: v, ...rest } = raw as Record<string, unknown>
  return { ...rest, [to]: v }
}
/** A target saved as { zone, service } is { solution, service }. */
export const legacyTarget = (raw: unknown) => renamedKey(raw, 'zone', 'solution')
/** Targets on a requirement, old or new. */
export const legacyTargets = <T extends { targets?: unknown }>(r: T): T => (Array.isArray(r.targets) ? { ...r, targets: r.targets.map(legacyTarget) } : r)

export const UNKNOWN = 'unknown' // reserved: never an id of a solution or service
/** The "service" for work no Buzzebees tool covers: judged as development, never as "need verification". */
export const CUSTOM_BUILD = 'custom-build'
export const MAX_TARGETS = 3

export const SOLUTIONS: Solution[] = [
  { id: 'internal', label: 'Internal product', hint: 'Used by Buzzebees staff only (internal tools); looser security.', archived: true },
  { id: 'crm-plus', label: 'CRM+ module', hint: 'Hub where the customer organisation logs in (AD login) and uses Buzzebees services as modules: User Management, Campaign Management, Report, Analytic. Includes the back office the customer uses to run campaigns themselves with our tool.' },
  { id: 'app-standard', label: 'App project — Standard', hint: 'Out-of-the-box customer app on Buzzebees Login using User Management + Campaign Management (redeem, sell, display customer data).' },
  { id: 'app-custom', label: 'App project — Custom', hint: 'Purpose-built app or web, separate from CRM+, built from Core building blocks (OTP, token auth, Sale Portal behind APIM). Typical for "make us an app and a web".' },
]

export const SERVICES: Service[] = [
  { id: 'user-management', label: 'User Management', hint: 'Member/customer data and identity: registration, login, OTP, token, session, profile.', confirmed: true },
  { id: 'campaign-management', label: 'Campaign Management', hint: 'Stock, create campaigns, targeting and schedule, redeem, coupons, selling items.', confirmed: true },
  { id: 'sale-portal', label: 'Sale Portal', hint: 'Product, sale plan, quotation, cart, transaction, post to SAP.', confirmed: true },
  { id: 'report-analytic', label: 'Report / Analytic', hint: 'Reports, dashboards, analytics, segmentation insight.', confirmed: true },
  { id: CUSTOM_BUILD, label: 'พัฒนาใหม่ (ไม่ใช่ tool ของ Buzzebees)', hint: 'Functionality that has to be built new for this customer because no Buzzebees service covers it (for example a new AI research feature). Choose this instead of guessing a service.', confirmed: true },
  { id: 'point', label: 'Point Service', hint: 'Earn/deduct points, earn rules, expiry, point liability.', confirmed: false },
  { id: 'notification', label: 'Notification', hint: 'In-app notifications, list and mark as read.', confirmed: false },
  { id: 'consent', label: 'Consent (PDPA)', hint: 'Consent capture, status, withdraw, history.', confirmed: false },
  { id: 'product-platform', label: 'Product Platform (Ext/Int/Permission)', hint: 'Feature & package control, assigning features per product.', confirmed: false },
  { id: 'apim', label: 'APIM Productization', hint: 'API gateway when a new product goes live.', confirmed: false },
  { id: 'channels', label: 'Line / SMS / Email / OCR / Shortlink', hint: 'Third-party and utility services.', confirmed: false },
  { id: 'fraud-tagging', label: 'Fraud Detection, User/App Tagging', hint: 'Fraud checks, user and app tags.', confirmed: false },
  { id: 'ad-b2c', label: 'AD B2C Wrapper', hint: 'AD login for CRM+.', confirmed: false },
]

/** The built-in taxonomy: what is used until an admin saves one, and when the database is not available. */
export const DEFAULT_TAXONOMY: Taxonomy = { solutions: SOLUTIONS, services: SERVICES }
export const activeSolutions = (tx: Taxonomy = DEFAULT_TAXONOMY) => tx.solutions.filter((z) => !z.archived)
export const activeServices = (tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.filter((s) => !s.archived)

export const isSolution = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.solutions.some((z) => z.id === id)
export const isService = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.some((s) => s.id === id)

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** A service written as its id ("point") or its label ("Point Service"), any case; undefined when unknown. */
export const findService = (input: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.find((s) => norm(s.id) === norm(input) || norm(s.label) === norm(input))?.id
/** A solution written as its id ("crm-plus") or its label ("CRM+ module"), any case; undefined when unknown. */
export const findSolution = (input: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.solutions.find((z) => norm(z.id) === norm(input) || norm(z.label) === norm(input))?.id

export const solutionLabel = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.solutions.find((z) => z.id === id)?.label ?? 'ไม่ทราบ solution'
export const serviceLabel = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.find((s) => s.id === id)?.label ?? 'ไม่ทราบ service'

/** Anything -> 1..MAX_TARGETS valid targets. Unknown ids become `unknown`; a fully unknown target is dropped when a better one exists. */
export function cleanTargets(raw: unknown, tx: Taxonomy = DEFAULT_TAXONOMY): Target[] {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const out: Target[] = []
  for (const t of list) {
    const n = legacyTarget(t)
    const o = (n && typeof n === 'object' ? n : {}) as Record<string, unknown>
    const solution = typeof o.solution === 'string' && isSolution(o.solution, tx) ? o.solution : UNKNOWN
    const service = typeof o.service === 'string' && isService(o.service, tx) ? o.service : UNKNOWN
    const key = `${solution}|${service}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ solution, service })
  }
  const known = out.filter((t) => t.solution !== UNKNOWN || t.service !== UNKNOWN)
  return (known.length ? known : [{ solution: UNKNOWN, service: UNKNOWN }]).slice(0, MAX_TARGETS)
}
