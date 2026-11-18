import type { StatusKey, Req } from '@/lib/types'
export type { StatusKey, Req }

export const STATUS: Record<StatusKey, { label: string; hint: string; dot: string; fg: string; bg: string; bd: string }> = {
  full: { label: 'Fully Supported', hint: 'Product ทำได้ตามที่ TOR ต้องการ ไม่ต้องพัฒนาเพิ่ม', dot: '#52C41A', fg: '#237804', bg: '#F6FFED', bd: '#B7EB8F' },
  config: { label: 'Configuration Required', hint: 'ทำได้ด้วยการตั้งค่า ไม่ต้องเขียนโค้ด', dot: '#1677FF', fg: '#0958D9', bg: '#E6F4FF', bd: '#91CAFF' },
  custom: { label: 'Customization Required', hint: 'ต้องพัฒนาเพิ่มใน Product', dot: '#FAAD14', fg: '#AD6800', bg: '#FFFBE6', bd: '#FFE58F' },
  integ: { label: 'Integration Required', hint: 'ต้องเชื่อมต่อกับระบบของลูกค้า', dot: '#434343', fg: '#262626', bg: '#F5F5F5', bd: '#BFBFBF' },
  none: { label: 'Not Supported', hint: 'Product ไม่รองรับ', dot: '#FF4D4F', fg: '#CF1322', bg: '#FFF2F0', bd: '#FFCCC7' },
  verify: { label: 'Need Verification', hint: 'ใน KB ไม่มี note ที่ตอบข้อนี้ได้ ไม่ได้แปลว่า Product ทำไม่ได้ ให้ถาม Product team หรือเพิ่ม note ใน KB แล้วรันใหม่', dot: '#BFBFBF', fg: '#595959', bg: '#FFFFFF', bd: '#8C8C8C' },
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
