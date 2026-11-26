export interface NavItem { to: string; label: string; short: string; section: string }

/** One list for the top bar and the page eyebrows ("03 / Results"). */
export const NAV: NavItem[] = [
  { to: '/', short: 'อัปโหลด TOR', label: 'อัปโหลด TOR', section: 'เริ่มประเมิน' },
  { to: '/review', short: 'Review', label: 'Review solutions', section: 'เริ่มประเมิน' },
  { to: '/matrix', short: 'Matrix', label: 'Compliance matrix', section: 'ผลประเมิน' },
  { to: '/history', short: 'History', label: 'TOR ทั้งหมด', section: 'ผลประเมิน' },
  { to: '/summary', short: 'Summary', label: 'Executive summary', section: 'ผลประเมิน' },
  { to: '/knowledge-base', short: 'Knowledge base', label: 'Knowledge base', section: 'อ้างอิง' },
  { to: '/ai-settings', short: 'AI settings', label: 'AI settings', section: 'อ้างอิง' },
]

export const navIndex = (path: string) => NAV.findIndex((n) => n.to === path)

/** The two tabs of one TOR's result: the summary (dashboard, gaps, open questions) and the per-requirement matrix. `count` shows the number of requirements. */
export const TOR_TABS: { to: string; label: string; count?: boolean }[] = [
  { to: '/summary', label: 'สรุป' },
  { to: '/matrix', label: 'รายข้อ', count: true },
]
/** Every page of the TOR flow: the list, the solution review before a run, and the result. The header menu item "TOR ทั้งหมด" stays lit on all of them. */
export const inTorGroup = (path: string) => ['/history', '/review', '/summary', '/matrix'].includes(path)

/** The header menu: the TOR pages are one item, "TOR ทั้งหมด", that opens the list. */
export const MENU: { to: string; label: string }[] = [
  { to: '/', label: 'อัปโหลด TOR' },
  { to: '/history', label: 'TOR ทั้งหมด' },
  { to: '/knowledge-base', label: 'Knowledge base' },
  { to: '/ai-settings', label: 'AI settings' },
]
