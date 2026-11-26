---
title: GenDash: Deploy และสภาพแวดล้อม
service: Generative Dashboard
support: config
updated: 2026-11-26
---

- มี Dev, Staging และ Prod แยกตาม Azure subscription ฝั่ง TH และ MY (Malaysia) มี registry และ Container App ของตัวเอง
- Build ครั้งเดียวแล้ว promote ผ่าน ACR (dev, stg, prd)
- ClickHouse เชื่อมผ่าน sidecar autossh (ชั่วคราว) ถ้าเปลี่ยนรหัสผ่านต้อง restart app
- ผู้ดูแลมี CLI manage.py สำหรับงานอย่างย้าย schema owner รันโดย admin เท่านั้น ไม่เปิดผ่าน HTTP
- เอกสารไม่ได้ระบุการติดตั้งนอก Azure หรือแบบ on-premise ต้องสอบถามทีม

ที่มา: GenDash Overview (2026-11-24)
