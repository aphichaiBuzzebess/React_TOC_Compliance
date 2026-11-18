import type { StatusKey, Req } from '@/lib/types'
export type { StatusKey, Req }

export const STATUS: Record<StatusKey, { label: string; dot: string; fg: string; bg: string; bd: string }> = {
  full: { label: 'Fully Supported', dot: '#52C41A', fg: '#237804', bg: '#F6FFED', bd: '#B7EB8F' },
  config: { label: 'Configuration Required', dot: '#1677FF', fg: '#0958D9', bg: '#E6F4FF', bd: '#91CAFF' },
  custom: { label: 'Customization Required', dot: '#FAAD14', fg: '#AD6800', bg: '#FFFBE6', bd: '#FFE58F' },
  integ: { label: 'Integration Required', dot: '#434343', fg: '#262626', bg: '#F5F5F5', bd: '#BFBFBF' },
  none: { label: 'Not Supported', dot: '#FF4D4F', fg: '#CF1322', bg: '#FFF2F0', bd: '#FFCCC7' },
  verify: { label: 'Need Verification', dot: '#BFBFBF', fg: '#595959', bg: '#FFFFFF', bd: '#8C8C8C' },
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
