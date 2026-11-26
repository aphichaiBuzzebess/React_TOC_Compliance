---
title: GenDash: Dataset catalog, Virtual dataset, SQL Lab และ Data import
service: Generative Dashboard
support: config
updated: 2026-11-26
---

- Managed dataset catalog: Schema tab จัดกลุ่ม dataset ต่อ App มี PII floor บน committed schema และแก้ PII ได้แบบเพิ่มเท่านั้น ต้องเปิดสิทธิ์ `datasets`
- Virtual dataset: บันทึก SQL เป็น dataset
- SQL Lab: รัน SQL เองผ่านเส้นทาง query เดียวกัน ต้องเปิดสิทธิ์ `sql-lab`
- Data import: นำเข้าไฟล์เป็น dataset ใหม่ และ onboard tenant ใหม่ ต้องเปิดสิทธิ์ `data-import`
- การตั้ง dataset และ schema ต่อ tenant ต้องตั้งค่าก่อนใช้งานกับข้อมูลของลูกค้า

ที่มา: GenDash Overview (2026-11-24)
