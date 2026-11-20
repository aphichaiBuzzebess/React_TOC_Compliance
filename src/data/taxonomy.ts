/**
 * Buzzebees product taxonomy as data: where a requirement lands (zone) and which service/feature it uses.
 * Source: React_Internal_Process `src/content/reference/taxonomy.ts` (v5). Keep the two in step by hand.
 * The "extra" services were inferred from Azure resource names, not an official catalogue: `confirmed: false`.
 */
export interface Zone { id: string; label: string; hint: string; examples?: string[]; archived?: boolean }
export interface Service { id: string; label: string; hint: string; confirmed: boolean; examples?: string[]; archived?: boolean }
/** Zones and services as data. Archived entries stay valid ids (old results, history and notes keep working) but are hidden from pickers and prompts. */
export interface Taxonomy { zones: Zone[]; services: Service[] }
export interface Target { zone: string; service: string }

export const UNKNOWN = 'unknown' // reserved: never an id of a zone or service
/** The "service" for work no Buzzebees tool covers: judged as development, never as "need verification". */
export const CUSTOM_BUILD = 'custom-build'
export const MAX_TARGETS = 3

export const ZONES: Zone[] = [
  { id: 'internal', label: 'Internal product', hint: 'Used by Buzzebees staff only (internal tools); looser security.' },
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
export const DEFAULT_TAXONOMY: Taxonomy = { zones: ZONES, services: SERVICES }
export const activeZones = (tx: Taxonomy = DEFAULT_TAXONOMY) => tx.zones.filter((z) => !z.archived)
export const activeServices = (tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.filter((s) => !s.archived)

export const isZone = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.zones.some((z) => z.id === id)
export const isService = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.some((s) => s.id === id)

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** A service written as its id ("point") or its label ("Point Service"), any case; undefined when unknown. */
export const findService = (input: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.find((s) => norm(s.id) === norm(input) || norm(s.label) === norm(input))?.id
/** A zone written as its id ("crm-plus") or its label ("CRM+ module"), any case; undefined when unknown. */
export const findZone = (input: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.zones.find((z) => norm(z.id) === norm(input) || norm(z.label) === norm(input))?.id

export const zoneLabel = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.zones.find((z) => z.id === id)?.label ?? 'ไม่ทราบ zone'
export const serviceLabel = (id: string, tx: Taxonomy = DEFAULT_TAXONOMY) => tx.services.find((s) => s.id === id)?.label ?? 'ไม่ทราบ service'

/** Anything -> 1..MAX_TARGETS valid targets. Unknown ids become `unknown`; a fully unknown target is dropped when a better one exists. */
export function cleanTargets(raw: unknown, tx: Taxonomy = DEFAULT_TAXONOMY): Target[] {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const out: Target[] = []
  for (const t of list) {
    const o = t && typeof t === 'object' ? (t as Record<string, unknown>) : {}
    const zone = typeof o.zone === 'string' && isZone(o.zone, tx) ? o.zone : UNKNOWN
    const service = typeof o.service === 'string' && isService(o.service, tx) ? o.service : UNKNOWN
    const key = `${zone}|${service}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ zone, service })
  }
  const known = out.filter((t) => t.zone !== UNKNOWN || t.service !== UNKNOWN)
  return (known.length ? known : [{ zone: UNKNOWN, service: UNKNOWN }]).slice(0, MAX_TARGETS)
}
