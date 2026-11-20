# Zone → Service mapping for TOR requirements — design

Date: 2026-11-20 · Status: awaiting review
Scope: `server/` (pipeline, kb, new classify), `api/classify.ts`, `kb/` frontmatter, `src/store`, one new review page, Matrix + Excel export.

## Intent

Today a TOR requirement is tagged with a flat `module` (Member, Point, …) and judged against KB notes found by keyword search. The BA wants the mapping to follow Buzzebees' own product taxonomy instead:

1. Which **zone** of Buzzebees does the requirement belong to (the product types in the taxonomy: Internal, CRM+ module, App project Standard, App project Custom)?
2. Inside that zone, which **service / feature** does it use (User Management, Campaign Management, Point Service, …), and what exactly matches?

One TOR can use several zones at once. Example: the customer wants an app and a web (App project, Custom) **and** an admin back-office where they manage campaigns themselves (the CRM+ Campaign Management module, which is Buzzebees' own tool). Each requirement must land in the right zone, and one requirement may touch more than one.

Why: the BA reads a TOR to answer "which Buzzebees products does this customer actually need, and what in each is covered / missing". A flat module list cannot answer that.

## Goals

- Every requirement carries one or more `targets` (`{ zone, service }`), proposed by the model and corrected by the BA before judging.
- The judge looks for evidence only in KB notes that belong to the requirement's service(s), not across the whole KB.
- A requirement where the customer **builds their own system instead of using Buzzebees' tool and asks for an API for it** (their own front end, their own campaign back office) is never auto-judged: status is `verify`, tagged so the reviewer sees they must ask Tech whether it is acceptable, or wait for the KB to be updated. (Decided with the user: the **narrow** reading.)
  - Flagged: "ขอ API ให้หลังบ้านของลูกค้าสร้างและจัดการ campaign เอง"; "ขอ API ให้เว็บของลูกค้าดึงคะแนนสมาชิกไปแสดงเอง".
  - Not flagged, judged from the KB as today (can still be `integ`): "เชื่อม POS ของลูกค้าเพื่อ redeem coupon"; "ส่ง Point Liability เข้า SAP"; "checkout ของเว็บลูกค้าหักคะแนนผ่าน API" (matches the Burn API note → `integ`, decided with the user).
- The Matrix shows zone and service per requirement and can filter by them.

## Non-goals

- No tracking of the follow-up ("asked Tech / waiting / answered"). The API case is a label only. (Decided with the user.)
- No editing targets after judging and re-running. v1 keeps the raw requirements and the confirmed targets in the store next to `result` (so a "reopen review and re-judge" can be added later), but ships no UI for it.
- No database, no change to where results are stored, no accounts.
- No editing of the taxonomy from the UI. It is a data file edited in code.
- No change to the open-question coverage check (`/api/questions`), extraction (`/api/extract`) or the status set (`full|config|custom|integ|none|verify`).
- No new Dashboard/Summary/PDF layout. Zone/service appear in the Matrix and the Excel export only.

## Anti-goals (would make this a failure even if it works)

- Guessing a zone or service when nothing fits. Unfit → zone/service `unknown` → the requirement is judged `verify`.
- A verdict other than `verify` without a cited KB note (existing rule, must keep).
- Judging an API-asking requirement as `full`/`config` because some KB note mentions an API. It stays `verify`; the note is shown only as supporting context.

## Approaches considered

- **A. Extract also assigns zone + service in the same call.** Cheapest, but the extract output per requirement grows, we already had to split calls to avoid 504 on big TORs, and the BA has no point to correct a zone before judging.
- **B. A separate classify step, then BA review, then judge. (Chosen.)** Extract stays as is. Classify runs in small batches like judge, then the BA confirms/edits the breakdown, then judge uses the confirmed targets. Cost: one more call stage and one more screen.
- **C. Rule/keyword zone detection, no model.** Stable, but Thai/English TOR wording is too varied and it cannot tell that one requirement touches several zones.

## Design

### Flow

```
extract (unchanged, per file)
  → classify  POST /api/classify, batches of ≤15, 3 in parallel  → targets + wantsApi per requirement
  → REVIEW    BA sees the zone breakdown, edits targets / API flag, presses Confirm
  → judge     POST /api/judge (batches as today) with the confirmed targets
  → results   Matrix / Dashboard / Gaps / Summary as today (+ zone/service in Matrix, Excel)
  (open-question coverage runs alongside judge, unchanged)
```

The run now pauses after classify. Run → classify finishes → the app shows the review screen; Confirm starts judging. The five-step progress band keeps its steps (Extract, Classify, Match, Assess, Recommend); "Classify" now means this classification.

### Taxonomy data (`src/data/taxonomy.ts`, new)

Imported by both server and web (server already imports from `src/data`). A copy of the Internal Process taxonomy v5 (`React_Internal_Process/src/content/reference/taxonomy.ts`); the file header names that source and version.

```ts
export interface Zone { id: string; label: string; hint: string }
export interface Service { id: string; label: string; hint: string; confirmed: boolean }
export const ZONES: Zone[]      // internal, crm-plus, app-standard, app-custom
export const SERVICES: Service[]
export const UNKNOWN = 'unknown'  // valid for both zone and service
```

Zones: Internal product · CRM+ module (AD login, services bought as modules) · App project — Standard · App project — Custom (OTP + User Management token auth, Core/Sale Portal behind APIM).
Services: Core — User Management, Campaign Management, Sale Portal, Report / Analytic; extra — Point Service, Notification, Consent (PDPA), Product Platform (Ext/Int/Permission), APIM Productization, Line/SMS/Email/OCR/Shortlink, Fraud Detection & User/App Tagging, AD B2C Wrapper.
`confirmed: false` for the "extra" services, because the taxonomy says they were inferred from Azure resource names, not an official catalogue; the review screen shows them with a "ยังไม่ยืนยัน" mark. Zones are not tied to specific services: any service can appear under any zone.

### Types (`src/lib/types.ts`)

```ts
export interface Target { zone: string; service: string }          // ids from taxonomy or 'unknown'
RawReq  += { targets?: Target[]; wantsApi?: boolean }               // optional → old saved results still load
Req     += { targets?: Target[]; wantsApi?: boolean }
```

`module` stays on both (still produced by extract; still used by the Dashboard and the Matrix module filter).

### Classify (`server/pipeline.ts` + `api/classify.ts`, new)

- Tool `report_targets`: per requirement id → `targets: Target[]` (1–3) and `wantsApi: boolean`.
- Prompt gets the zone and service lists (id, label, hint) and the rule for `wantsApi`: true only when the customer builds their own system in place of Buzzebees' tool and asks for an API for it. False for a requirement that uses Buzzebees' tool (admin back office, report, campaign setup), and false for integrations where Buzzebees connects to or is called by the customer's systems (POS, SAP, e-commerce checkout) — those are judged from the KB (`integ`). The prompt includes the flagged / not-flagged examples above.
- A target may name a zone with service `unknown` (e.g. "build a mobile app and web" is `{app-custom, unknown}`). Such a target has no KB notes unless a note carries that zone and no service, so it is judged `verify`, which is the honest result.
- Server validates the model output against the taxonomy: unknown ids → `unknown`; empty targets → `[{unknown, unknown}]`; more than 3 → first 3; a fully-unknown target is dropped when the requirement has any target with a known zone or service; non-boolean `wantsApi` → false. Same body limits as judge (1–15 requirements, text ≤ 1000 chars). Same auth/LLM header handling (`handle`, `llmFromRequest`).
- Failure of one batch fails the run with the existing error banner (as judge does today).

### Review screen (new route `/review`, reached automatically after classify)

- Header: the zone breakdown of this TOR, e.g. "App project — Custom · 12 ข้อ", "CRM+ module · 9 ข้อ", "ไม่ทราบ · 2 ข้อ".
- List grouped by zone → service; each row: id, requirement text, its target(s), an "ขอ API" toggle. The BA can change zone/service per target (selects fed by the taxonomy), add or remove a target (1–3), and toggle the API flag. Rows with `unknown` are listed first.
- "Confirm and continue" starts judging with the edited targets. Leaving the screen without confirming keeps the requirements (same persistence as `result`); a reload resumes at this screen.
- Look and wording follow the existing editorial UI components (`Card`, `Pill`, etc.); Thai text.

### KB (`kb/*.md`, `server/kb.ts`)

- New optional frontmatter: `service:` (one service id) and `zone:` (comma-separated zone ids; omitted = applies to every zone). `module:` stays and keeps working. `parseNote` reads both; a bad id is treated as absent.
- Retrieval for a requirement: notes whose `service` equals one of its targets' services **and** whose `zone` is empty or contains that target's zone → tf-idf ranking inside that set, top 4. If the set is empty (including `unknown` targets) the requirement gets no candidate notes and is judged `verify` by the existing "no note, no verdict" rule.
- The 12 existing notes get `service:` as a **proposal for the owner to confirm** (my call, mapped from the notes' content): Point Service ← earn-rules, expiry-policy, accounting-export, burn-api; Campaign Management ← targeting-schedule, e-coupon; User Management ← registration-channels, multi-brand-profile, customer-profile; Report / Analytic ← point-report, crm/limitations; Consent (PDPA) ← pdpa-consent. No `zone:` yet. `kb/README.md` documents the two new fields.
- The Knowledge Base page shows service next to module if present (small, optional).

### Judge (`server/pipeline.ts`)

- Uses the confirmed `targets` for retrieval as above and includes each requirement's targets in the prompt so the model can say which zone/service the evidence covers.
- One verdict per requirement, made from the notes of all its targets together. Status is the least favourable one the notes support. If any target has no note at all, the status is `verify` and the reason names that target. `evidence` lists the cited notes grouped by target.
- Zone scopes evidence only through a note's own `zone:`; with no `zone:` a note applies to every zone, so for now zone is mostly a label (Matrix grouping, filters, the breakdown on the review screen).
- `wantsApi === true`: no model verdict is accepted. Result is `s: 'verify'`, `reason` = "ลูกค้าขอ API — ต้องถาม Tech ว่ารับได้ไหม หรือรอ KB อัปเดต", `rec` = the same, `evidence` lists the retrieved candidate notes as context (or "ไม่พบหลักฐานที่ตรงกัน"). The model call may still run for the other requirements in the batch; the override is applied in code afterwards, so it cannot be argued away by the model.
- Result keeps `targets` and `wantsApi` on each `Req`.

### Matrix and export

- Matrix: two columns (zone, service) in the table and detail panel; filters for zone and service next to the module filter; an "ขอ API · ถาม Tech" tag on flagged rows and a filter chip for them. Requirements with several targets show all of them.
- Excel export: Zone, Service and "ขอ API" columns. PDF unchanged.
- Old saved results (no `targets`) render as before with empty zone/service cells.

### Tests

Vitest, in `src/__tests__/` next to the existing ones: classify validation (unknown ids, empty/too many targets, bad `wantsApi`); `parseNote` with and without `service`/`zone`; retrieval filtering (service match, zone-scoped note, no match → no candidates); judge override for `wantsApi` (even when a note matches), and **not** applied to "checkout หักคะแนนผ่าน API" / "เชื่อม POS" fixtures (they stay `integ` from the KB); multi-target verdict (one target without notes → `verify`, evidence grouped by target); zone-only target → `verify`; store pauses after classify and resumes on confirm; review edits reach the judge request; Matrix shows zone/service/API tag and still renders an old result; Excel columns.

## Constraints

- Calls must stay short (batches ≤ 15, ≤ 3 in parallel) because long calls hit 504 on big TORs.
- Vercel function body limit and the AI key handling are unchanged; no key is stored.
- Thai UI text; keep contrast/a11y standards of the current components.

## Left to the builder

Exact prompt wording for classify, and the one-line `hint` of each zone/service (authored from the taxonomy prose; the BA corrects wrong rows on the review screen; if the user supplies sample TOR sentences with the expected zone, they become test fixtures); the hard calls are Standard vs Custom and "customer's own admin back office" (CRM+ Campaign Management) vs a back office inside an App project; layout details of the review screen; how the review state is persisted (follow how `result` is persisted); naming of ids; whether to show the unconfirmed-service mark as a pill or a footnote; small refactors needed to share the batching helper between classify and judge.

## Risks

- The taxonomy copy can drift from the Internal Process source. Mitigation: header with source/version; it is a small data file.
- The model may over-flag or miss `wantsApi`; the BA can toggle it on the review screen, and the judge never turns it back into a confident verdict.
- Until the KB is retagged with `service:` for more capabilities, many requirements will be `verify` (login/OTP, Sale Portal, Notification have no notes today). That is the honest result, and it shows where the KB is thin.
