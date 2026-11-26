---
title: GenDash: Canvas, ชนิด widget และการจัดวาง
service: Generative Dashboard
support: full
updated: 2026-11-26
---

widget มี 4 ชนิด: chart, KPI, table, markdown

- chart เก็บ ECharts option เต็มพร้อมข้อมูล ไม่ต้อง fetch เพิ่มตอน render
- KPI แสดง delta (เครื่องหมายและหน่วย) และมี count-up
- table มีแถว total, แทนค่า, format วันที่และตัวเลข และสีตามค่า
- ลากจัดวางและปรับขนาดได้ มี Tab set ซ้อนกันได้ และ header คั่นส่วน
- ตั้ง theme ระดับ dashboard และ style ต่อ widget สี chart มาจาก palette เดียว
- มี Health check ตรวจ widget ที่พัง และ View query ดู SQL จริงที่ผ่านการ rewrite ตาม tenant และ filter

ที่มา: GenDash Overview (2026-11-24)
