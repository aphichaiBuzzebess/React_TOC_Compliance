# TOR Scouter

อ่าน TOR ของลูกค้า → แยก Requirement → เทียบกับ Knowledge Base ของ Product → ประเมิน compliance / feature gap

```
kb/ (Obsidian vault, .md)  ──►  server/kb.ts  ──┬─► api/judge.ts    (Vercel function)
                                                └─► mcp/server.ts   (MCP, stdio)
TOR (pdf/docx/xlsx) ─► api/extract.ts ─► requirements ─► api/judge.ts ─► web (Matrix, Gap, Summary)
```

## Knowledge base
เปิดโฟลเดอร์ `kb/` ด้วย Obsidian 1 note = 1 capability/ข้อจำกัด frontmatter: `title`, `module`, `support` (`full|config|custom|integ|none`), `updated`
ไม่มี note ที่ตรง = `Need Verification` (โมเดลไม่เดา) การแก้ note มีผลหลัง deploy ใหม่ เพราะ note ถูกแพ็คไปกับ function

## MCP
`.mcp.json` ลงทะเบียน `tor-scouter-kb` (tools: `search_kb`, `get_note`, `list_modules`) ใช้ใน Claude Code/Desktop เพื่อให้ Claude ช่วยค้น/ตรวจ KB

## Run
```bash
npm install
cp .env.example .env.local   # ใส่ ANTHROPIC_API_KEY และ ACCESS_CODE
npx vercel dev               # web + /api ; `npm run dev` ไม่มี /api
npm test
```
Production: ตั้ง `ANTHROPIC_API_KEY` และ `ACCESS_CODE` ใน Vercel env (endpoint ปฏิเสธทุก request ถ้าไม่ตั้ง `ACCESS_CODE`)

## Limits
- ไฟล์ TOR ≤ 4 MB (เพดาน body ของ Vercel function) ถ้าต้องใหญ่กว่านี้ให้อัปโหลดผ่าน Vercel Blob
- ผลลัพธ์เก็บใน localStorage ของเบราว์เซอร์ ยังไม่มี database
