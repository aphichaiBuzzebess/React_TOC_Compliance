# Zone → Service mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this session runs it natively). Steps use checkbox syntax.

**Goal:** Tag each TOR requirement with Buzzebees zone + service, let the BA confirm them, and judge only against the matching KB notes; "own system + API" requirements stay `verify`.

**Architecture:** extract (unchanged) → new classify batch call → review page → judge with confirmed targets. Targets and `wantsApi` ride on `RawReq`/`Req`; with no `targets` the judge keeps today's tf-idf behaviour (old results and existing tests stay valid).

**Tech Stack:** TypeScript, React 18, zustand, vitest, Vercel functions (`api/`), existing `Llm` tool-call abstraction.

**Spec:** `docs/superpowers/specs/2026-11-20-zone-service-mapping-design.md`

## Global Constraints

- Calls stay short: batches ≤ 15 requirements, ≤ 3 in parallel (504 on big TORs).
- Statuses unchanged: `full|config|custom|integ|none|verify`; no verdict other than `verify` without a cited KB note.
- Zones: internal, crm-plus, app-standard, app-custom; `unknown` valid for zone and service; max 3 targets per requirement.
- `wantsApi` is narrow: customer builds own system in place of Buzzebees' tool and asks for an API. POS / SAP / checkout-via-API are NOT flagged.
- Old saved results (no `targets`) must still render. No new dependencies. Thai UI text.

## Review Focus

- Model returns unknown zone/service ids, empty or >3 targets, non-boolean `wantsApi` → sanitised, never throws.
- A note with a bad `service:`/`zone:` value → treated as absent, note still loads.
- Judge request body with garbage `targets` → sanitised on the server.
- `wantsApi` requirement whose service has a matching `integ` note → still `verify`.
- Reload while the review is pending → `/review` still shows the requirements.

## Tasks

### Task 1: Taxonomy data, types, sanitiser
**Files:** Create `src/data/taxonomy.ts`; Modify `src/lib/types.ts`; Test `src/__tests__/server.test.ts`
**Produces:** `ZONES`, `SERVICES`, `UNKNOWN`, `Target`, `cleanTargets(raw: unknown): Target[]`, `zoneLabel(id)`, `serviceLabel(id)`; `RawReq`/`Req` gain optional `targets?: Target[]`, `wantsApi?: boolean`.
- [ ] Tests: `cleanTargets` maps unknown ids to `unknown`, empty/garbage → `[{unknown,unknown}]`, caps at 3, drops fully-unknown targets when a known one exists, de-duplicates.
- [ ] Implement.

### Task 2: KB frontmatter and per-target retrieval
**Files:** Modify `server/kb.ts`, `kb/**/*.md`, `kb/README.md`; Test `src/__tests__/server.test.ts`
**Produces:** `Note.service?: string`, `Note.zone?: string[]`; `retrieveForTargets(kb: Note[], text: string, targets: Target[]): { notes: Note[]; byTarget: Map<Target, Note[]> }`.
- [ ] Tests: parse with/without service/zone; bad ids dropped; service-scoped pool; zone-scoped note excluded from other zone; no pool → empty; tf-idf miss falls back to pool; existing "loads every note" count stays 12.
- [ ] Implement; add `service:` to the 12 notes (proposal in spec) and document in README.

### Task 3: Classify (pipeline + API)
**Files:** Modify `server/pipeline.ts`; Create `api/classify.ts`; Test `src/__tests__/server.test.ts`
**Produces:** `classify(llm: Llm, reqs: RawReq[]): Promise<RawReq[]>`; `POST /api/classify` `{requirements}` → `{results: RawReq[]}` (1–15).
- [ ] Tests with a fake `Llm`: valid output kept; bad ids → unknown; missing id → `[{unknown,unknown}]`, `wantsApi` false; non-boolean `wantsApi` false.
- [ ] Implement with tool `report_targets`; prompt carries zone/service hints and the narrow `wantsApi` rule with examples.

### Task 4: Judge uses targets, API override
**Files:** Modify `server/pipeline.ts`, `api/judge.ts`; Test `src/__tests__/server.test.ts`
- [ ] Tests: target-scoped evidence string `Zone › Service: KB › Module › Title`; `wantsApi` → `verify` even with a matching `integ` note and a model `integ` verdict; "checkout" fixture (no flag) stays `integ`; target without notes → `verify` naming it; zone-only target → `verify`; legacy (no targets) unchanged; `api/judge` sanitises targets.
- [ ] Implement: retrieval via `retrieveForTargets` when `targets` present; prompt lists targets; override applied in code after the model; result carries `targets`/`wantsApi`.

### Task 5: Store flow and review page
**Files:** Modify `src/store/useAssessmentStore.ts`, `src/App.tsx`, `src/data/nav.ts`, `src/pages/NewAssessment.tsx`, `src/__tests__/web.test.tsx`; Create `src/pages/Review.tsx`
**Produces:** state `review: RawReq[] | null` (persisted); actions `setTargets(id, targets)`, `setWantsApi(id, flag)`, `confirmReview()`; `runReal()` now stops after classify with `review` set and `step: 2`.
- [ ] Update the 4 existing runReal tests to mock `/api/classify` and call `confirmReview()`.
- [ ] New tests: run pauses with `review` set and no `result`; edited targets reach the judge request; reload keeps `review`.
- [ ] Implement store, `/review` page (breakdown header, rows grouped by zone→service, selects, API toggle, add/remove target ≤3, Confirm), NewAssessment shows a "Review" link while `review` is pending and navigates there after Run.

### Task 6: Matrix, Excel
**Files:** Modify `src/pages/Matrix.tsx`, `src/lib/exportXlsx.ts`, `src/pages/KnowledgeBase.tsx`, `src/__tests__/web.test.tsx`
- [ ] Tests: Matrix shows zone/service, filters by zone and service, shows "ขอ API · ถาม Tech" tag + filter, still renders an old result; Excel has Zone/Service/ขอ API columns.
- [ ] Implement.

### Task 7: Gates
- [ ] `npx tsc -b`, `npx vitest run`, `npm run build` all pass.
