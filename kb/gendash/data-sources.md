---
title: GenDash: แหล่งข้อมูล (Databricks, ClickHouse)
service: Generative Dashboard
support: config
updated: 2026-11-26
---

ดึงข้อมูลจาก Databricks หรือ ClickHouse เท่านั้น (มี mock สำหรับพัฒนาและทดสอบ) ข้อมูลของลูกค้าต้องอยู่ใน warehouse ใดตัวหนึ่งก่อน

- Databricks: shared dataset, committed schema และ app-owned private schema ตอน runtime
- ClickHouse: ต่อผ่าน connection ที่เข้ารหัสและมี SSRF guard หนึ่ง query ต่อหนึ่ง connection
- ทุก query ผ่านชั้นป้องกันเดียวกัน: tenant, dataset, known table, read-only, row limit และ PII
- เอกสารไม่ได้ระบุว่าต่อตรงกับแหล่งอื่น เช่น ฐานข้อมูลหรือ API ของลูกค้า ต้องนำเข้าเป็น dataset (ดู Data import) หรือสอบถามทีม

ที่มา: GenDash Overview (2026-11-24)
