# TOR Scouter

อ่าน TOR ของลูกค้า → แยก Requirement → เทียบกับ Knowledge Base ของ Product → ประเมิน compliance / feature gap

```
kb/ (Obsidian vault, .md)  ──►  server/kb.ts  ──┬─► api/judge.ts    (Vercel function)
                                                └─► mcp/server.ts   (MCP, stdio)
TOR (pdf/docx/xlsx) ─► api/extract.ts ─► requirements ─┬─► api/judge.ts ─► web (Matrix, Gap, Summary)
                                                      └─► api/questions.ts ─► web (Open questions)
```

## Knowledge base
เปิดโฟลเดอร์ `kb/` ด้วย Obsidian 1 note = 1 capability/ข้อจำกัด frontmatter: `title`, `module`, `support` (`full|config|custom|integ|none`), `updated`
ไม่มี note ที่ตรง = `Need Verification` (โมเดลไม่เดา) การแก้ note มีผลหลัง deploy ใหม่ เพราะ note ถูกแพ็คไปกับ function

## Open questions
`questions/` คือ Basic Question ของ BA (1 ไฟล์ = 1 หัวข้อ, frontmatter `function:` + bullet คำถาม) หลังแยก requirement ระบบเทียบกับหัวข้อเหล่านี้ แล้วสรุปคำถามที่ TOR ยังไม่ตอบ (`covered|partial|missing`) ใช้ถามลูกค้าก่อนยืนยัน scope แก้คำถามได้ใน Obsidian เช่นกัน

## MCP
`.mcp.json` ลงทะเบียน `tor-scouter-kb` (tools: `search_kb`, `get_note`, `list_modules`) ใช้ใน Claude Code/Desktop เพื่อให้ Claude ช่วยค้น/ตรวจ KB

## AI settings
ทุกคนกรอก provider, model และ API key ของตัวเองที่หน้า `/ai-settings` (Claude หรือ Gemini, เลือกโมเดลจากรายการหรือพิมพ์เอง) key อยู่ในหน่วยความจำของหน้าเว็บเท่านั้น ไม่ถูกเก็บทั้งในเบราว์เซอร์และ server ถูกส่งไปกับคำขอแต่ละครั้งเพื่อใช้เรียก AI ค่าใช้จ่ายเป็นของบัญชีผู้ใช้ มีปุ่ม Test connection

ถ้าอยากให้มี AI ตั้งต้นให้คนที่ไม่ใส่ key ให้ตั้ง `LLM_PROVIDER` กับ `<PROVIDER>_API_KEY` (เช่น `GEMINI_API_KEY`, เลือก `GEMINI_MODEL` ได้) ใน `.env.local` หรือใน env ของ Vercel เซิร์ฟเวอร์จะใช้ค่านี้เมื่อคำขอไม่มี key และไม่ส่ง key นี้ออกไปที่เบราว์เซอร์เลย คนที่ใส่ key ของตัวเองจะใช้ key ของตัวเองเสมอ เว็บ production ที่ไม่มี `ACCESS_CODE` จะไม่ใช้ค่านี้ เพื่อไม่ให้คนแปลกหน้าใช้ key ของคุณ

## Run
```bash
npm install
cp .env.example .env.local   # ACCESS_CODE ไม่บังคับ
npm run dev:api              # /api บน :3100
npm run dev                  # web, proxy /api -> :3100
npm test
```
ไม่มี AI key ฝั่ง server: ผู้ใช้กรอกเองที่หน้า AI settings ถ้าตั้ง `ACCESS_CODE` ใน Vercel env ทุก endpoint จะต้องใช้รหัสนี้ (ไม่ตั้ง = เปิดให้ทุกคน)

## Accounts, saved key and history (optional)
ตั้ง `DATABASE_URL` แล้วเว็บจะเปิดระบบบัญชี: ล็อกอินด้วยชื่อผู้ใช้ + รหัสผ่าน, บันทึก AI key ของตัวเองบน server แบบเข้ารหัส (ไม่ส่งกลับมาที่เบราว์เซอร์ เห็นแค่ 4 ตัวท้าย) และเก็บประวัติผลประเมินล่าสุด 50 รายการต่อคน (เห็นเฉพาะเจ้าของ) ถ้าไม่ตั้ง เว็บทำงานแบบเดิมทุกอย่าง

ตั้งค่าครั้งแรก
1. เพิ่ม Postgres จาก Vercel Marketplace (เช่น Neon) ให้โปรเจค จะได้ `DATABASE_URL` ใน env ให้เอง (preview ควรใช้ database แยก ไม่ชี้ไปตัวจริง)
2. ตั้ง `KEY_ENCRYPTION_SECRET` (`openssl rand -base64 32`) และ `ACCESS_CODE` (รหัสทีมที่ใช้สมัคร) ใน Vercel env ถ้าไม่ตั้ง `ACCESS_CODE` จะสมัครไม่ได้บน Vercel
3. รัน `DATABASE_URL=… npm run db:init` หนึ่งครั้งเพื่อสร้างตาราง

ดูแลผู้ใช้ (ต้องมี `DATABASE_URL`)
```bash
npm run user:reset -- <username>     # ออกรหัสผ่านชั่วคราว และเตะทุก session ของคนนั้น (เขาเปลี่ยนรหัสเองได้หลังล็อกอิน)
npm run user:disable -- <username>   # ปิดบัญชี (enable เปิดคืน)
npm run user:delete -- <username>    # ลบบัญชีพร้อม key และประวัติ
```
- ต้องการปิดไม่ให้คนใหม่สมัคร: เปลี่ยน `ACCESS_CODE`
- ทดสอบกับ Postgres จริง: `TEST_DATABASE_URL=postgres://… npx vitest run src/__tests__/db.pg.test.ts`

## Knowledge base ที่แก้ได้ในแอป (เมื่อเปิดระบบบัญชี)
หน้า **Knowledge base** มี 3 แท็บ: **Notes** (ความสามารถของ Product ที่ใช้ตัดสินสถานะ), **Taxonomy** (zone/service และตัวอย่างประโยคที่ใช้จัดหมวด) และ **Prompts** (Extract, Classify, Judge, ตัวตรวจคำถามค้าง) เฉพาะ **admin** แก้ได้ คนอื่นดูอย่างเดียว การแก้มีผลกับการรันใหม่ภายในราว 30 วินาที ไม่ต้อง deploy และทุกการแก้เก็บเวอร์ชันล่าสุด 20 รุ่น กู้คืนได้ (admin)
- ครั้งแรก: `npm run db:init` สร้างตารางและนำเข้า note จาก `kb/` ให้ครั้งเดียว (รันซ้ำไม่ซ้ำ ไม่เขียนทับ ไม่ดึง note ที่ลบแล้วกลับมา) ถ้ายังไม่ได้ทำ หน้านี้จะขึ้นแบนเนอร์ "ใช้ค่าเริ่มต้น" และระบบประเมินใช้ไฟล์ใน `kb/` กับ prompt ของระบบ ปุ่ม "นำเข้าจากไฟล์" ในหน้านี้ทำสิ่งเดียวกัน
- ตั้ง admin คนแรก: `npm run user:promote -- <username>`
- **หลังนำเข้า ฐานข้อมูลคือตัวจริง** ไฟล์ใน `kb/` เป็นต้นฉบับและใช้ตอนไม่เปิดระบบบัญชี การแก้ไฟล์ไม่ส่งผลต่อฐานข้อมูลอีก (ใช้ปุ่มนำเข้าเพื่อเพิ่ม note ใหม่จากไฟล์)
- ระบบเติมสองอย่างให้เสมอและแก้ไม่ได้จากหน้านี้: ประโยคกันคำสั่งแอบแฝง และรูปแบบผลลัพธ์ ส่วนรายการ zone/service ใน prompt ของ Classify ถูกเติมที่ `{{zones}}` / `{{services}}` (ถ้าลบออก ระบบเติมท้ายให้)
- zone/service ลบไม่ได้ ให้ **archive** แทน เพื่อให้ผลเก่า ประวัติ และ note ที่อ้างถึงยังใช้ได้
- ที่ยังอ่านไฟล์อย่างเดียว: `npm run kb:check` และ MCP `tor-scouter-kb` (ล้าสมัยหลังแก้ในแอป) และ BA question ใน `questions/`

## Limits
- ไฟล์ TOR ≤ 4 MB (เพดาน body ของ Vercel function) ถ้าต้องใหญ่กว่านี้ให้อัปโหลดผ่าน Vercel Blob
- ผลลัพธ์เก็บใน localStorage ของเบราว์เซอร์ ยังไม่มี database
- key ผ่าน server ของเราทุกครั้งที่เรียก AI (HTTPS) เพื่อให้ server อ่าน PDF/KB ได้ ไม่ได้เรียก AI จากเบราว์เซอร์โดยตรง
