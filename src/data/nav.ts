export interface NavItem { to: string; label: string; short: string; section: string }

/** One list for the top bar and the page eyebrows ("03 / Results"). */
export const NAV: NavItem[] = [
  { to: '/', short: 'New', label: 'New assessment', section: 'เริ่มประเมิน' },
  { to: '/dashboard', short: 'Dashboard', label: 'Coverage dashboard', section: 'ผลประเมิน' },
  { to: '/matrix', short: 'Matrix', label: 'Compliance matrix', section: 'ผลประเมิน' },
  { to: '/gaps', short: 'Gaps', label: 'Gap & recommendation', section: 'ผลประเมิน' },
  { to: '/questions', short: 'Questions', label: 'Open questions', section: 'คำถามถึงลูกค้า' },
  { to: '/summary', short: 'Summary', label: 'Executive summary', section: 'ผลประเมิน' },
  { to: '/knowledge-base', short: 'Knowledge base', label: 'Knowledge base', section: 'อ้างอิง' },
  { to: '/ai-settings', short: 'AI settings', label: 'AI settings', section: 'อ้างอิง' },
]

export const navIndex = (path: string) => NAV.findIndex((n) => n.to === path)
