# Product knowledge base

Obsidian vault: เปิดโฟลเดอร์ `kb/` ด้วย Obsidian ได้เลย

- ไฟล์นี้ไม่มี frontmatter จึงไม่ถูกนับเป็น note
- 1 note = 1 capability หรือข้อจำกัดของ Product
- เริ่มจาก copy `_template.md` (ไฟล์ขึ้นต้น `_` ไม่ถูกนับเป็น note) แล้วรัน `npm run kb:check` ก่อนส่ง ตัวตรวจจะบอกว่า note ไหนผิดเพราะอะไร (ระบบประเมินจะข้าม note ที่ผิดเงียบ ๆ)
- frontmatter ที่ต้องใส่มี 3 อย่าง: `title`, `service` (ชื่ออ่านออกก็ได้ เช่น `Point Service` หรือ id), `support`; `module` ไม่บังคับ (ถ้าไม่ใส่ใช้ชื่อ service) `updated` ไม่บังคับ
- `support` เลือก 1 อย่าง: `full | config | custom | integ | none`
- `service` เลือกจาก: User Management · Campaign Management · Sale Portal · Report / Analytic · Point Service · Notification · Consent (PDPA) · Product Platform (Ext/Int/Permission) · APIM Productization · Line / SMS / Email / OCR / Shortlink · Fraud Detection, User/App Tagging · AD B2C Wrapper (รายการจริงอยู่ใน `src/data/taxonomy.ts`)
- `solution` ไม่บังคับ: ใส่เมื่อ note ใช้เฉพาะบาง solution (คั่นด้วย `,` เช่น `CRM+ module, App project — Custom`) ถ้าไม่ใส่ = ใช้ได้ทุก solution ระบบหา note ตาม service ของ requirement ก่อน
- ถ้าไม่มี note ที่ตรงกับ requirement ระบบจะตีเป็น **Need Verification** (ไม่เดา)
- อ้างอิง note อื่นด้วย `[[folder/name]]`
