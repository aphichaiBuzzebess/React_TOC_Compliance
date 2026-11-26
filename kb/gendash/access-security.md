---
title: GenDash: Login, Role, สิทธิ์และความปลอดภัย
service: Generative Dashboard
support: full
updated: 2026-11-26
---

- Login ด้วย JWT และ bcrypt, Sign in with Microsoft (Entra ID, ผูกกับ user ที่มีอยู่ ไม่สร้าง user อัตโนมัติ) และ Embed SSO สำหรับฝังในพอร์ทัล
- Role: User, Admin และ Super Admin หน้า Roles, API tokens, Token usage และ API docs ใช้ได้เฉพาะ Super Admin
- เปิดหรือปิดเมนูรายคนด้วย feature key เช่น agent-chat, datasets, sql-lab, data-import, dashboard-presets, dashboard-settings
- ผู้ใช้เห็นเฉพาะ tenant ที่ได้สิทธิ์ ตรวจที่ HTTP boundary ก่อนโหลด session
- Quota: จำกัดจำนวนข้อความรายวันและ token รายเดือนต่อผู้ใช้ (รีเซ็ตวันที่ 1)
- Public API: เปิดแบบ opt-in, scoped, read-only ด้วย API token พร้อม rate limit

ที่มา: GenDash Overview (2026-11-24)
