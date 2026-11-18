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

## Run
```bash
npm install
cp .env.example .env.local   # ใส่ ANTHROPIC_API_KEY และ ACCESS_CODE
ACCESS_CODE=xxx npx vercel dev --listen 3100   # /api  (เพิ่ม ANTHROPIC_API_KEY ถ้าจะเรียก Claude จริง)
npm run dev                  # web, proxy /api -> :3100
npm test
```
Production: ตั้ง `ANTHROPIC_API_KEY` และ `ACCESS_CODE` ใน Vercel env (endpoint ปฏิเสธทุก request ถ้าไม่ตั้ง `ACCESS_CODE`)

## Limits
- ไฟล์ TOR ≤ 4 MB (เพดาน body ของ Vercel function) ถ้าต้องใหญ่กว่านี้ให้อัปโหลดผ่าน Vercel Blob
- ผลลัพธ์เก็บใน localStorage ของเบราว์เซอร์ ยังไม่มี database
