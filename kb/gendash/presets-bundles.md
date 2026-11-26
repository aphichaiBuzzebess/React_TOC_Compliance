---
title: GenDash: Preset, Bundle และ Dashboard Preset
service: Generative Dashboard
support: full
updated: 2026-11-26
---

มี chart และ query template ที่เขียนไว้แล้ว ใช้ได้โดยไม่ต้องรอโมเดล ปัจจุบันมี 1,209 preset ใน catalog

- Chart Library ให้เลือก preset ใส่ canvas
- Bundle คือชุดหลาย widget เช่น receipt_iq_standard มี 25 story widget
- Dashboard Preset flow สร้างทั้งหน้าในครั้งเดียว ต้องเปิดสิทธิ์ `dashboard-presets`
- preset ผูกกับ dialect และ column จริงของ Databricks ข้อมูลของลูกค้าต้องมี column ตรงกัน ไม่เช่นนั้นต้องปรับ preset

ที่มา: GenDash Overview (2026-11-24)
