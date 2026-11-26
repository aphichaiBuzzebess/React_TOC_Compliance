---
title: GenDash: สร้าง dashboard ด้วยภาษาธรรมชาติ (Chat agent)
service: Generative Dashboard
support: full
updated: 2026-11-26
---

ผู้ใช้พิมพ์คำขอเป็นภาษาธรรมชาติ เช่น "แสดงรายได้ตามภูมิภาคเป็น bar chart" แล้ว AI agent เลือกชนิดกราฟ query ข้อมูล และวาง widget บน canvas ให้ ระบบส่งออกมาเป็น widget spec แบบ JSON ไม่ใช่โค้ดหรือรูปภาพ

- agent เพิ่มและแก้ widget ได้ (chart, KPI, table, markdown) ย้ายและจัดวาง และตั้ง filter
- agent ดู schema และ query ข้อมูลเองได้ รวมถึง pivot table
- ถามยืนยันก่อนทำสิ่งที่กระทบมาก
- โมเดลเริ่มต้นคือ Claude เลือก DeepSeek หรือ GPT บน Azure Foundry ได้ด้วยการตั้งค่า มีปุ่ม Stop ที่หยุดการ generate จริง
- ต้องเปิดสิทธิ์ feature key `agent-chat` ให้ผู้ใช้ และแชทใช้ได้เฉพาะ editor

ที่มา: GenDash Overview (2026-11-24)
