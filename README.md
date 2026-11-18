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

## Run
```bash
npm install
cp .env.example .env.local   # ACCESS_CODE ไม่บังคับ
npm run dev:api              # /api บน :3100
npm run dev                  # web, proxy /api -> :3100
npm test
```
ไม่มี AI key ฝั่ง server: ผู้ใช้กรอกเองที่หน้า AI settings ถ้าตั้ง `ACCESS_CODE` ใน Vercel env ทุก endpoint จะต้องใช้รหัสนี้ (ไม่ตั้ง = เปิดให้ทุกคน)

## Limits
- ไฟล์ TOR ≤ 4 MB (เพดาน body ของ Vercel function) ถ้าต้องใหญ่กว่านี้ให้อัปโหลดผ่าน Vercel Blob
- ผลลัพธ์เก็บใน localStorage ของเบราว์เซอร์ ยังไม่มี database
- key ผ่าน server ของเราทุกครั้งที่เรียก AI (HTTPS) เพื่อให้ server อ่าน PDF/KB ได้ ไม่ได้เรียก AI จากเบราว์เซอร์โดยตรง
