import type { StatusKey, Req } from '@/lib/types'
export type { StatusKey, Req }

/** Colours are CSS variables (index.css), so light and dark each get their own. */
export const STATUS: Record<StatusKey, { label: string; th: string; hint: string; dot: string; fg: string; bg: string; bd: string }> = {
  full: { label: 'Fully Supported', th: 'พร้อมใช้', hint: 'Product ทำได้ตามที่ TOR ต้องการ ไม่ต้องพัฒนาเพิ่ม', dot: 'var(--st-full-dot)', fg: 'var(--st-full-fg)', bg: 'var(--st-full-bg)', bd: 'var(--st-full-bd)' },
  config: { label: 'Configuration Required', th: 'ตั้งค่าเพิ่ม', hint: 'ทำได้ด้วยการตั้งค่า ไม่ต้องเขียนโค้ด', dot: 'var(--st-config-dot)', fg: 'var(--st-config-fg)', bg: 'var(--st-config-bg)', bd: 'var(--st-config-bd)' },
  custom: { label: 'Customization Required', th: 'ต้องพัฒนาเพิ่ม', hint: 'ต้องพัฒนาเพิ่มใน Product', dot: 'var(--st-custom-dot)', fg: 'var(--st-custom-fg)', bg: 'var(--st-custom-bg)', bd: 'var(--st-custom-bd)' },
  integ: { label: 'Integration Required', th: 'ต้องเชื่อมระบบ', hint: 'ต้องเชื่อมต่อกับระบบของลูกค้า', dot: 'var(--st-integ-dot)', fg: 'var(--st-integ-fg)', bg: 'var(--st-integ-bg)', bd: 'var(--st-integ-bd)' },
  none: { label: 'Not Supported', th: 'ไม่รองรับ', hint: 'Product ไม่รองรับ', dot: 'var(--st-none-dot)', fg: 'var(--st-none-fg)', bg: 'var(--st-none-bg)', bd: 'var(--st-none-bd)' },
  verify: { label: 'Need Verification', th: 'ต้องตรวจสอบ', hint: 'ใน KB ไม่มี note ที่ตอบข้อนี้ได้ ไม่ได้แปลว่า Product ทำไม่ได้ ให้ถาม Product team หรือเพิ่ม note ใน KB แล้วรันใหม่', dot: 'var(--st-verify-dot)', fg: 'var(--st-verify-fg)', bg: 'var(--st-verify-bg)', bd: 'var(--st-verify-bd)' },
}
export const ORDER: StatusKey[] = ['full', 'config', 'custom', 'integ', 'none', 'verify']

export const STEPS: [name: string, desc: string][] = [
  ['Extract', 'อ่านและแยก Requirement จาก TOR'],
  ['Classify', 'จัดกลุ่ม Requirement ตาม Module'],
  ['Match', 'เทียบกับ Product Capability'],
  ['Assess', 'ประเมิน Compliance และ Feature Gap'],
  ['Recommend', 'แนะนำ Feature หรือ Solution'],
]

export const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '0%')
