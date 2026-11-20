# Accounts, stored API key, history — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (run natively in this session). Steps use checkbox syntax.

**Goal:** Username/password accounts on a server, an encrypted per-user AI key that never leaves the server, and per-user assessment history.

**Architecture:** `DATABASE_URL` switches account mode on; off = today's stateless app. A `Db` repository interface (Postgres via `pg`, plus an in-memory twin for tests) sits under `server/auth.ts` (passwords, sessions, throttle), `server/vault.ts` (AES-256-GCM), `server/history.ts` (zod). `handle()` enforces session + CSRF header in account mode; `llmFromRequest` becomes async and resolves header key → stored key → default.

**Tech Stack:** TypeScript, `pg`, `node:crypto` (scrypt, AES-GCM), zod (already a dependency), React, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-accounts-keys-history-design.md`

## Global Constraints

- Stateless mode and all existing behaviour keep working with no database.
- The API key is never in a response, log, URL, localStorage or error text.
- Every query filters by the session's `user_id`; ids from the client are never trusted for ownership.
- Username 3–40 `[a-z0-9._@-]`, case-insensitive; password 10–200 chars; session cookie `ts_session` HttpOnly, SameSite=Lax, 14 days, only sha256 stored; non-GET needs header `x-requested-with: tor-scouter`.
- Throttle 15-minute windows: sign-in ≥5/username or ≥20/IP; sign-up ≥5/IP or ≥50 total; sign-up needs `ACCESS_CODE` whenever `VERCEL_ENV` is set.
- History: keep 50 newest, reject > 2 MB, `schema: 1`. Max Vercel functions: add only `api/auth.ts`, `api/key.ts`, `api/history.ts`.

## Review Focus

- Ciphertext copied to another user fails to decrypt (user id is AAD); tampered ciphertext fails.
- Unknown user vs wrong password: same error; disabled user cannot sign in and old sessions die.
- User A cannot read/update/delete user B's history or key by id.
- Undecryptable stored key → "ใส่ API key ใหม่" error, never the operator default.
- Sign-out / 401 / different owner wipes the persisted store; no data flash before the auth probe returns.

## Tasks

### Task 1: Db layer
**Files:** Create `server/db.ts`, `db/schema.sql`, `scripts/db-init.ts`; Modify `package.json`; Test `src/__tests__/auth.test.ts`
**Produces:** `interface Db` (users, sessions, `bump/failures/clear` attempts, key vault rows, assessments with prune-to-50 in `insertAssessment`), `memoryDb(): Db`, `pgDb(url): Db`, `getDb(): Db`, `setDb(db: Db | null)` for tests; `accountMode(): boolean`.
- [ ] Tests (memory impl): create user (duplicate → null), sessions expire, `bump` counts within a window and resets after, insert prunes beyond the cap, every assessment query is scoped by user.
- [ ] Implement; `npm i pg && npm i -D @types/pg`; schema per spec; `db-init` runs the SQL.

### Task 2: Passwords, vault, sessions, throttle
**Files:** Create `server/auth.ts`, `server/vault.ts`; Test `src/__tests__/auth.test.ts`
**Produces:** `hashPassword(pw): Promise<string>`, `verifyPassword(pw, stored): Promise<boolean>`; `encryptKey(userId, key): Enc`, `decryptKey(userId, enc): string` (throws on tamper/wrong user/missing secret); `signup/login/logout/changePassword` functions taking `(db, req, body)`; `currentUser(req): Promise<User | null>`; `sessionCookie(token|null)`.
- [ ] Tests: hash/verify; vault roundtrip, wrong user, flipped byte, no secret; signup needs code, disabled without `ACCESS_CODE` when `VERCEL_ENV` set; throttle returns 429 after the limits; login same error for unknown/wrong; change password kills other sessions.
- [ ] Implement per spec.

### Task 3: `handle()` and async LLM resolution
**Files:** Modify `server/http.ts`, `api/extract.ts`, `api/classify.ts`, `api/judge.ts`, `api/questions.ts`, `api/status.ts`; Test `src/__tests__/server.test.ts`, `src/__tests__/auth.test.ts`
**Produces:** `handle(req, run: (user: User | null) => Promise<unknown>, opts?: { public?: boolean })`; `llmFromRequest(req): Promise<LlmConfig>`; `keySource(req)` for status.
- [ ] Tests: account mode → 401 without session, 403 on non-GET without the header, stateless unchanged; precedence header > stored > default; undecryptable stored key errors; stored key redacted from errors; existing http tests updated to `await`.
- [ ] Implement; `GET /api/status` adds `keySource` and `last4`.

### Task 4: Endpoints
**Files:** Create `api/auth.ts`, `api/key.ts`, `api/history.ts`, `server/history.ts`; Test `src/__tests__/auth.test.ts`
**Produces:** routes per spec; `parseEntry(body): Entry` (zod, clamps, computes `counts`), `normaliseEntry(row): Entry`.
- [ ] Tests: auth flow end to end on the memory db; key PUT never echoes the key, GET returns last4 only; history create/list/get/put/delete, cross-user 404, oversize rejected, invalid shape rejected, normaliser upgrades/defaults.
- [ ] Implement.

### Task 5: Client
**Files:** Modify `src/store/useAssessmentStore.ts`, `src/App.tsx`, `src/components/AppShell.tsx`, `src/pages/AiSettings.tsx`, `src/data/nav.ts`; Create `src/pages/Login.tsx`, `src/pages/History.tsx`; Test `src/__tests__/web.test.tsx`
**Produces:** store fields `mode`, `user`, `storedKey`, `owner`, `historyId`; actions `loadAuth()`, `signIn/signUp/signOut`, `saveKey/removeKey`, `openHistory(id)`; `api()` adds the CSRF header; 401 → wipe.
- [ ] Tests: gate shows skeleton then login in account mode and nothing in stateless; sign-out and owner mismatch wipe the store; stored key makes Run available without a typed key; finished run saves history and `valid` change updates it; history list open/delete; AI settings shows `••••last4` and never the key.
- [ ] Implement.

### Task 6: Operator tooling and docs
**Files:** Create `scripts/user-admin.ts`; Modify `package.json`, `.env.example`, `README.md`
- [ ] `npm run user:reset|disable|enable|delete -- <username>`, `db:init`; README setup (Marketplace Postgres, `KEY_ENCRYPTION_SECRET`, `ACCESS_CODE`, preview note); `.env.example` entries.

### Task 7: Gates
- [ ] `npx tsc -b`, `npx vitest run`, `npm run build` pass; if `TEST_DATABASE_URL` is available, run the gated Postgres test.
