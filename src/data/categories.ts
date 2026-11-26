/** The categories a TOR requirement is filed under, in the order the pages list them. The extract step picks one per requirement. */
export const CATEGORIES = [
  'Dashboard & Report',
  'Membership & Tier',
  'System Point',
  'Rewards & Coupon',
  'Mission',
  'Survey',
  'Marketing Automation',
  'Integration & API',
  'Security & PDPA',
  'Infrastructure & Service',
  'อื่น ๆ',
] as const

/** Contract and bidder terms (past work, delivery time, warranty, payment). Not a product feature: never judged against the KB, the BD ticks them off. */
export const COMMERCIAL = 'เงื่อนไขสัญญาและผู้ยื่น'
export const ALL_CATEGORIES: string[] = [...CATEGORIES, COMMERCIAL]

export const isCommercial = (r: { module: string }) => r.module === COMMERCIAL

/** Sort key: the listed order, then any other module name (results saved before categories existed) after it. */
export const catRank = (m: string) => {
  const i = ALL_CATEGORIES.indexOf(m)
  return i < 0 ? ALL_CATEGORIES.length : i
}
/** The module names present, in category order. */
export const orderedModules = (rows: { module: string }[]) => [...new Set(rows.map((r) => r.module))].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b))
