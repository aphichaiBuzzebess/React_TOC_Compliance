// Sample data for the prototype — mirrors the design canvas. Replace with agent output later.
export type StatusKey = 'full' | 'config' | 'custom' | 'integ' | 'none' | 'verify'

export const STATUS: Record<StatusKey, { label: string; dot: string; fg: string; bg: string; bd: string; count: number }> = {
  full: { label: 'Fully Supported', dot: '#52C41A', fg: '#237804', bg: '#F6FFED', bd: '#B7EB8F', count: 38 },
  config: { label: 'Configuration Required', dot: '#1677FF', fg: '#0958D9', bg: '#E6F4FF', bd: '#91CAFF', count: 17 },
  custom: { label: 'Customization Required', dot: '#FAAD14', fg: '#AD6800', bg: '#FFFBE6', bd: '#FFE58F', count: 11 },
  integ: { label: 'Integration Required', dot: '#434343', fg: '#262626', bg: '#F5F5F5', bd: '#BFBFBF', count: 8 },
  none: { label: 'Not Supported', dot: '#FF4D4F', fg: '#CF1322', bg: '#FFF2F0', bd: '#FFCCC7', count: 5 },
  verify: { label: 'Need Verification', dot: '#BFBFBF', fg: '#595959', bg: '#FFFFFF', bd: '#8C8C8C', count: 8 },
}
export const ORDER: StatusKey[] = ['full', 'config', 'custom', 'integ', 'none', 'verify']
export const TOTAL = 87

export interface Req { id: string; module: string; s: StatusKey; conf: string; text: string; reason: string; evidence: string; rec: string }
export const REQS: Req[] = [
  { id: 'R-001', module: 'Member', s: 'full', conf: '92%', text: 'สมัครสมาชิกผ่าน LINE OA และ Mobile App', reason: 'Registration channels ใน Knowledge Base ระบุ LINE OA และ Mobile App เป็นช่องทางมาตรฐาน', evidence: 'KB › Member › Registration channels', rec: 'ใช้ Feature มาตรฐาน ไม่ต้องพัฒนาเพิ่ม' },
  { id: 'R-007', module: 'Member', s: 'custom', conf: '74%', text: 'รวมบัญชีสมาชิก (Merge) จากหลาย Brand', reason: 'รองรับ Member หลาย Brand แต่ยังไม่พบ Flow การ Merge บัญชีที่มีอยู่แล้ว', evidence: 'KB › Member › Multi-brand profile', rec: 'ออกแบบ Merge rule และ Duplicate detection เพิ่ม' },
  { id: 'R-012', module: 'Point', s: 'config', conf: '88%', text: 'อัตราการให้คะแนนแยกตาม Brand และ Category สินค้า', reason: 'Earn rule ตั้งค่าตาม Brand และ Product category ได้', evidence: 'KB › Point › Earn rules', rec: 'ตั้งค่า Earn rule ต่อ Brand ระหว่าง Implementation' },
  { id: 'R-015', module: 'Point', s: 'full', conf: '90%', text: 'คะแนนหมดอายุแบบ Rolling 24 เดือน', reason: 'Point expiry รองรับแบบ Rolling period', evidence: 'KB › Point › Expiry policy', rec: 'ใช้ Feature มาตรฐาน' },
  { id: 'R-021', module: 'Point', s: 'verify', conf: '51%', text: 'ใช้คะแนนร่วมข้าม Brand ในเครือ (Coalition)', reason: 'ข้อมูลใน Knowledge Base ไม่เพียงพอที่จะยืนยัน', evidence: 'ไม่พบหลักฐานที่ตรงกัน', rec: 'ยืนยันกับ Product team ก่อนเสนอ' },
  { id: 'R-028', module: 'Campaign', s: 'full', conf: '95%', text: 'สร้าง Campaign ตาม Segment พร้อมตั้งเวลาเริ่ม–สิ้นสุด', reason: 'Campaign รองรับ Target segment และ Schedule', evidence: 'KB › Campaign › Targeting & schedule', rec: 'ใช้ Feature มาตรฐาน' },
  { id: 'R-034', module: 'Reward', s: 'integ', conf: '80%', text: 'แลก E-Coupon เพื่อใช้ที่หน้าร้าน (POS)', reason: 'มี E-Coupon แต่ต้องเชื่อม POS ของลูกค้าเพื่อ Redeem', evidence: 'KB › Reward › E-Coupon › POS API', rec: 'เชื่อมต่อผ่าน Coupon API กับ POS ของลูกค้า' },
  { id: 'R-041', module: 'Reward', s: 'integ', conf: '77%', text: 'แลกคะแนนเป็นส่วนลดบน e-Commerce', reason: 'ต้องเชื่อมต่อ Checkout ของเว็บไซต์ลูกค้า', evidence: 'KB › Integration › Burn API', rec: 'ใช้ Burn API ร่วมกับ e-Commerce platform' },
  { id: 'R-049', module: 'CRM', s: 'custom', conf: '69%', text: 'Customer 360 รวมประวัติการซื้อ Online และ Offline', reason: 'มี Profile และ Transaction แต่ยังไม่รวมข้อมูล Offline จากหลายแหล่ง', evidence: 'KB › CRM › Customer profile', rec: 'ปรับ Data model และ Import pipeline' },
  { id: 'R-056', module: 'Reporting', s: 'config', conf: '83%', text: 'Dashboard ยอดคะแนนสะสมและการแลก', reason: 'Report มาตรฐานรองรับ ต้องตั้งค่า Filter ต่อ Brand', evidence: 'KB › Reporting › Point report', rec: 'ตั้งค่า Report template ต่อ Brand' },
  { id: 'R-063', module: 'Integration', s: 'integ', conf: '72%', text: 'ส่งข้อมูล Point Liability เข้า SAP', reason: 'มี Export แต่ต้องเชื่อมต่อ SAP ของลูกค้า', evidence: 'KB › Integration › Accounting export', rec: 'กำหนด Interface กับ SAP ร่วมกับทีมบัญชี' },
  { id: 'R-071', module: 'Security', s: 'full', conf: '89%', text: 'PDPA Consent Management', reason: 'มี Consent capture และ History', evidence: 'KB › Security › PDPA consent', rec: 'ใช้ Feature มาตรฐาน' },
  { id: 'R-078', module: 'CRM', s: 'none', conf: '86%', text: 'Predictive churn และ Next Best Offer', reason: 'Knowledge Base ระบุว่ายังไม่มี Predictive model', evidence: 'KB › CRM › Limitations', rec: 'ไม่ Commit — พิจารณา Partner หรือ Roadmap' },
]

export interface Gap { ids: string; s: StatusKey; title: string; gap: string; rec: string }
export const GAPS: Gap[] = [
  { ids: 'R-007', s: 'custom', title: 'Cross-brand account merge', gap: 'ยังไม่มี Flow การรวมบัญชีสมาชิกที่มีอยู่แล้วจากหลาย Brand', rec: 'Merge rule + Duplicate detection บน Member module' },
  { ids: 'R-049', s: 'custom', title: 'Customer 360 (Online + Offline)', gap: 'ข้อมูลการซื้อ Offline ยังไม่ถูกรวมใน Profile', rec: 'ขยาย Data model และ Import pipeline จาก POS' },
  { ids: 'R-034', s: 'integ', title: 'POS coupon redemption', gap: 'ต้องเชื่อมระบบ POS ของลูกค้า', rec: 'Coupon API + คู่มือ Integration สำหรับ POS vendor' },
  { ids: 'R-041', s: 'integ', title: 'e-Commerce point burn', gap: 'ต้องเชื่อม Checkout ของเว็บไซต์', rec: 'Burn API ร่วมกับ e-Commerce platform ของลูกค้า' },
  { ids: 'R-063', s: 'integ', title: 'SAP point liability', gap: 'ต้องส่งข้อมูลบัญชีคะแนนเข้า SAP', rec: 'กำหนด Interface spec ร่วมกับทีมบัญชีลูกค้า' },
  { ids: 'R-078', s: 'none', title: 'Predictive churn / Next Best Offer', gap: 'ยังไม่มี Predictive model ใน Product', rec: 'ไม่ Commit ใน Phase แรก — พิจารณา Partner' },
]

export const MODULES: [name: string, total: number, full: number][] = [
  ['Member & Registration', 14, 9], ['Point Engine', 16, 8], ['Campaign', 13, 7], ['Reward & Redemption', 12, 6],
  ['CRM & Segmentation', 9, 3], ['Reporting', 8, 2], ['Integration', 9, 1], ['Security & PDPA', 6, 2],
]

export const STEPS: [name: string, desc: string][] = [
  ['Extract', 'อ่านและแยก Requirement จาก TOR'],
  ['Classify', 'จัดกลุ่ม Requirement ตาม Module'],
  ['Match', 'เทียบกับ Product Capability'],
  ['Assess', 'ประเมิน Compliance และ Feature Gap'],
  ['Recommend', 'แนะนำ Feature หรือ Solution'],
]

export const KB_LABELS = ['Loyalty platform — Member & Point', 'Campaign & Reward', 'CRM, Reporting & Integration', 'Other products (not in demo scope)']

export const pct = (n: number, d: number) => `${Math.round((n / d) * 1000) / 10}%`
