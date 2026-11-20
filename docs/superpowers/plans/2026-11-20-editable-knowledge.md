# Editable knowledge base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (run natively in this session). Steps use checkbox syntax.

**Goal:** Admins edit prompts, taxonomy and notes in the app (stored in Postgres, versioned); everyone else reads.

**Architecture:** One generic table `kb_items(kind,key,data,updated_by,updated_at)` plus `kb_versions` and `kb_meta` (builder's call: simpler than three tables, same behaviour as the spec). `server/knowledge.ts` loads items (30 s cache, fresh for editors, falls back to files/built-in defaults with a status flag), validates and saves. The pipeline takes a `Knowledge` object (taxonomy + prompts + notes) instead of constants. The web keeps a `taxonomy` in the store.

**Tech Stack:** TypeScript, `pg`, zod, React, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-editable-knowledge-design.md`

## Global Constraints

- Stateless mode and every existing test keep working; all new parameters default to the built-in taxonomy/prompts.
- Admin-only writes (403 otherwise; 403 in stateless mode); 409 when the editor's `updatedAt` differs from the database row.
- Guard sentence (`UNTRUSTED`), output tool schemas and the Classify zone/service lists are always added by code.
- Taxonomy ids immutable, `unknown` reserved, never deleted (archive); limits: ≤12 zones, ≤60 services, label ≤80, hint ≤400, ≤10 examples ≤200 chars, JSON ≤100 KB; prompts non-empty ≤20,000; note body ≤20,000, title ≤120, module ≤60.
- Note `path` is the identity and never changes. Keep last 20 versions per item.
- Function count stays 9 (`api/kb.ts` replaced by `api/knowledge.ts`).

## Review Focus

- Editor removes `{{zones}}`/`{{services}}` or the guard from a prompt → code still adds them.
- Two admins save the same item → second gets 409, nothing lost.
- A non-admin or stateless caller writes → 403.
- Database unreadable / not seeded → runs continue on defaults and `/api/status` says so.
- Restoring a taxonomy version that lacks newer ids → they come back archived; restoring a note validates its service/zones.

## Tasks

### Task 1: Taxonomy and prompts as data
**Files:** Modify `src/data/taxonomy.ts`, `server/pipeline.ts`, `server/questions.ts`; Create `server/prompts.ts`; Test `src/__tests__/server.test.ts`
**Produces:** `Taxonomy`, `DEFAULT_TAXONOMY`, helper functions with an optional `tx` argument; `PromptKey`, `DEFAULT_PROMPTS`, `buildSystem(key, text, tx)`; `extractRequirements/classify/judge/checkCoverage` accept an optional `Knowledge`-like second argument and behave as before without it.
- [ ] Tests: `buildSystem` always ends with the guard and contains zone/service lists even when the text has no placeholders; placeholders are replaced in place; archived entries are left out of the lists; examples are included; defaults reproduce today's behaviour (existing tests unchanged).

### Task 2: Db layer
**Files:** Modify `db/schema.sql`, `server/db.ts`; Test `src/__tests__/knowledge.test.ts`, `src/__tests__/db.pg.test.ts`
**Produces:** `kbList/kbGet/kbPut/kbDelete/kbVersions/kbVersion/kbDeletedKeys/kbSeed/getMeta/setMeta` on `Db` (memory + pg), `KbKind`, `KbItem`.
- [ ] Tests: put create/update, stale `expected` → `'conflict'`, `expected: null` on existing → conflict, version pruned at 20, delete keeps versions and shows in `kbDeletedKeys`, `kbSeed` skips live rows and rows with history.

### Task 3: Knowledge service and API
**Files:** Create `server/knowledge.ts`, `api/knowledge.ts`; Delete `api/kb.ts`; Modify `api/status.ts`, `api/extract.ts`, `api/classify.ts`, `api/judge.ts`, `api/questions.ts`; Test `src/__tests__/knowledge.test.ts`
**Produces:** `loadKnowledge(opts)`, `clearKnowledgeCache()`, `saveNote`, `removeNote`, `saveTaxonomy`, `savePrompt`, `resetPrompt`, `restoreVersion`, `importFromFiles`; routes per spec.
- [ ] Tests: roles (non-admin 403, stateless 403, admin ok), 409, validation (bad service/zone/support/size, taxonomy id removal/reserved/limits), fallback to defaults when not seeded or the db throws, cache vs `fresh`, restore rules, import skips deleted notes, versions admin-only.

### Task 4: Web taxonomy and labels
**Files:** Modify `src/store/useAssessmentStore.ts`, `src/pages/Review.tsx`, `src/pages/Matrix.tsx`, `src/lib/exportXlsx.ts`; Test `src/__tests__/web.test.tsx`
**Produces:** store `taxonomy`, `loadTaxonomy()`, hook `useTaxonomy()`; pickers hide archived but keep a selected archived value.
- [ ] Tests: Review lists services from the loaded taxonomy and hides archived; Matrix labels a custom service; `loadTaxonomy` falls back to default on failure; called before a run.

### Task 5: Knowledge base page
**Files:** Rewrite `src/pages/KnowledgeBase.tsx` (split `src/pages/knowledge/*` if large); Test `src/__tests__/web.test.tsx`
- [ ] Tests: non-admin sees text without inputs/save; admin edits and saves a prompt/note/taxonomy entry; stale save shows the reload message; defaults banner; archive/unarchive; version list and restore (admin only).

### Task 6: Seeding and docs
**Files:** Modify `scripts/db-init.ts`, `README.md`, `.env.example`
- [ ] `db:init` creates tables, imports `kb/` files once (sets `seeded_at`); README explains the Knowledge page, MCP/`kb:check` staying file-based, and how to re-import.

### Task 7: Gates
- [ ] `npx tsc -b`, `npx vitest run`, `npm run build`; commit.
