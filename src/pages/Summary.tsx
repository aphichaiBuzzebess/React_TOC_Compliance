import { useAssessmentStore } from '@/store/useAssessmentStore'
import { STATUS, TOTAL, pct } from '@/data/tor'
import { Alert, Button, PageHeader } from '@/components/ui'

const FIT = STATUS.full.count + STATUS.config.count
const GAPS = STATUS.custom.count + STATUS.integ.count + STATUS.none.count

export default function Summary() {
  const confirmed = useAssessmentStore((s) => Object.values(s.valid).filter((v) => v === 'ok').length)
  const stats = [
    { label: 'Product fit', value: pct(FIT, TOTAL), note: 'Supported out of the box or by configuration' },
    { label: 'Gaps', value: String(GAPS), note: 'Customization, integration, not supported' },
    { label: 'Open questions', value: String(STATUS.verify.count), note: 'Need verification with product team' },
  ]
  return (
    <>
      <PageHeader title="Executive summary" action={<Button>Download PDF</Button>} />
      <section className="flex max-w-[880px] flex-col gap-6 rounded-md border border-line bg-white p-8">
        <div className="flex flex-wrap gap-8">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col">
              <span className="text-xs text-muted">{s.label}</span>
              <span className="text-[38px] font-medium leading-tight text-[#262626]">{s.value}</span>
              <span className="text-xs text-muted">{s.note}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-medium text-[#262626]">Assessment</h2>
          <p className="m-0 leading-[1.7]">Product รองรับ TOR ได้ {FIT} จาก {TOTAL} ข้อ ทั้งแบบพร้อมใช้งานและตั้งค่าเพิ่มเติม จุดแข็งอยู่ที่ Member, Point และ Campaign ส่วนที่ต้องเตรียมคือการเชื่อมต่อ POS / e-Commerce / SAP และการรวมบัญชีสมาชิกข้าม Brand</p>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-medium text-[#262626]">Before committing scope</h2>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
            <li>ยืนยัน {STATUS.verify.count} ข้อที่ Need Verification กับ Product team</li>
            <li>แยก Integration {STATUS.integ.count} ข้อ (POS, e-Commerce, SAP) เป็น Phase ที่ชัดเจน</li>
            <li>ไม่ Commit ข้อที่ Not Supported {STATUS.none.count} ข้อ จนกว่าจะมี Roadmap</li>
          </ul>
        </div>
        <Alert tone="warning" title={`PM validation: ${confirmed} of ${TOTAL} results confirmed`}>Figures on this page are sample data for the prototype.</Alert>
      </section>
    </>
  )
}
