# Accounts, stored API key, and review history — design

Date: 2026-11-20 · Status: awaiting review
Builds on: the stateless TOR Scouter (key sent per request, results in localStorage, shared `ACCESS_CODE`).

## Intent

Each person should sign in once, keep **their own** AI key on the server **securely** (no re-typing, never visible again), and get a **history** of their assessments they can reopen. Today nothing is stored server-side: the key lives only in page memory, results live in one browser's localStorage, and access is one shared code.

Chosen with the user: accounts on a server (not a browser-only vault); no Microsoft SSO and no IT involvement, because that process is too long.

## Goals

- Sign up / sign in / sign out with username + password. Session via cookie.
- Save, replace and remove the user's AI key (provider, model, key). The key is encrypted at rest and **never sent back** to a browser; the UI shows only the last 4 characters.
- A run uses, in order: a key sent in the request header (today's behaviour) → the signed-in user's stored key → the operator's default AI.
- Every finished assessment is saved to the user's history automatically; the user can list, reopen (restores results, coverage and PM validations into the app) and delete entries. PM validation changes update the saved entry.
- Each user sees only their own data.
- With no database configured the app behaves exactly as today (local dev, tests, stateless deploys).

## Non-goals

- SSO, email verification, email password reset, roles/admin UI, sharing history between users, storing the uploaded TOR files, usage/cost tracking, 2FA.
- Password reset in v1 is an operator command (`npm run user:reset`), not a self-service flow; changing your own password is supported.
- The pending review (before judging) is not history; it stays clearable and is not saved server-side.

## Anti-goals (a failure even if it works)

- The API key appearing in any response, log, URL, error message, localStorage or the client bundle.
- One user reading, listing or deleting another user's key or history, including by guessing ids.
- Leftover data: after sign-out, the next person on the same browser must not see the previous user's results, review, coverage or validations.
- A signed-up stranger: signing up without the team code, or when no team code is configured in production.

## Approaches considered

- **A. Browser-only vault** (passphrase-encrypted key and history in the browser). No infrastructure, but per-browser, loses data on clearing the browser, no cross-device. Not chosen.
- **B. Server accounts + Postgres (chosen).** Works on every device, history survives, sharing can be added later. Needs one database (Vercel Marketplace Postgres, self-serve) and new auth/crypto code we own.
- **C. Microsoft Entra SSO.** Best identity, but needs IT to register an app. Rejected by the user (process too long).

## Design

### Mode switch

`DATABASE_URL` set → **account mode**: every API call except sign-up, sign-in and the auth probe needs a valid session; the shared `ACCESS_CODE` is no longer sent per request, it only gates **sign-up**. `DATABASE_URL` unset → **stateless mode**: today's behaviour unchanged (per-request `ACCESS_CODE`, header key, server default).

### Data (`db/schema.sql`, idempotent; `npm run db:init`)

| Table | Columns |
|---|---|
| `users` | `id uuid pk`, `username text unique` (stored lower-case), `password_hash text`, `disabled bool default false`, `created_at` |
| `sessions` | `token_hash text pk` (sha256 of the cookie token), `user_id`, `expires_at`, `created_at` |
| `api_keys` | `user_id pk`, `provider`, `model`, `ciphertext bytea`, `iv bytea`, `tag bytea`, `last4 text`, `updated_at` |
| `assessments` | `id uuid pk`, `user_id`, `customer text`, `files text[]`, `counts jsonb`, `schema int`, `data jsonb` (`result`, `coverage`, `valid`), `created_at`, `updated_at`; index on `(user_id, created_at desc)` |
| `attempts` | `key text pk` (`login:user:<name>`, `login:ip:<ip>`, `signup:ip:<ip>`, `signup:all`), `failures int`, `window_start` — incremented with one atomic upsert (`insert … on conflict do update`), so concurrent requests cannot slip past the limit |

All queries are parameterised and filter by `user_id` from the session, never from the request body. New dependency: `pg` (node-postgres, `Pool` with `max: 1` per function instance, Neon's pooled connection string). It also talks to a plain local Postgres, supports real transactions, and keeps the SQL testable. A small repository interface in `server/db.ts` has the Postgres implementation and an in-memory one for logic tests; an integration test against a real database runs only when `TEST_DATABASE_URL` is set (it covers the SQL, `bytea`/`text[]`/`jsonb`, pruning and the atomic counters).

### Accounts and sessions (`server/auth.ts`)

- Username: 3–40 chars of `a-z 0-9 . _ @ -`, case-insensitive. Password: ≥ 10 chars, ≤ 200. Sign-up requires the team code (`ACCESS_CODE`, timing-safe compare). In account mode with no `ACCESS_CODE` set and `VERCEL_ENV=production`, sign-up is disabled (fail closed).
- Password hash: `scrypt` from `node:crypto`, per-user random salt, stored as `scrypt$N$r$p$salt$hash`, constant-time compare. Unknown user and wrong password give the same error and similar timing (hash a dummy).
- Throttle (all in the `attempts` table, 429 until the 15-minute window passes): sign-in fails ≥ 5 per **username** or ≥ 20 per **IP**; sign-up (team code) fails ≥ 5 per **IP** or ≥ 50 in total (`signup:all`). A success clears that username/IP's login counters. Client IP is the first value of `x-forwarded-for` (Vercel sets it; this app is only supported behind Vercel or a proxy that does), falling back to `x-real-ip`, then `unknown`.
- Sign-up fails closed everywhere except local dev: it needs `ACCESS_CODE` whenever `VERCEL_ENV` is set (production **and** preview); with no `ACCESS_CODE` it is disabled. Previews should use their own database (README says so); the README tells the operator not to point a preview at the production `DATABASE_URL`.
- Change password: `POST /api/auth?action=password` with the current and new password (new ≥ 10 chars); on success all of that user's other sessions are deleted.
- Disabled users (`disabled = true`) cannot sign in and their sessions are rejected. Operator commands: `npm run user:reset -- <username>` (prints a temporary password, deletes that user's sessions; the user is told to change it and the page nudges them until they do), `npm run user:disable -- <username>` and `user:enable`, `user:delete`.
- Session: 32 random bytes; cookie `ts_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` outside localhost, 14 days; only the sha256 is stored. Sign-out deletes the row and expires the cookie. Expired sessions are rejected and deleted lazily.
- CSRF: every non-GET API call must also carry header `x-requested-with: tor-scouter` (our client adds it in the shared `api()` helper); together with `SameSite=Lax` this blocks cross-site form posts.

### API key vault (`server/vault.ts`)

- AES-256-GCM, key from env `KEY_ENCRYPTION_SECRET` (32 random bytes, base64; `openssl rand -base64 32`), a fresh 12-byte IV per save, and the **user id as additional authenticated data**, so a ciphertext copied to another user fails to decrypt. A missing or malformed secret makes every key endpoint fail with a clear message (fail closed).
- Key endpoints return `{ provider, model, last4 }` or `null`, never the key. Validation on save is the same as today's header validation (provider, model pattern, key ≤ 512 chars). The existing "Test connection" works with the stored key.
- `llmFromRequest(req)` becomes `async` (it may read the session and the vault) and keeps the precedence above. If a stored key exists but cannot be decrypted (secret rotated or lost, data tampered), the call fails with a clear "ใส่ API key ใหม่ที่ AI settings" error and **never** falls back to the operator default (that would spend the operator's key unexpectedly). Redaction of the stored key happens inside the code that holds it, before any message leaves `llmFromRequest`'s callers; `handle()` keeps redacting the header key and the default.
- `GET /api/status` also returns `keySource`: `'header' | 'stored' | 'default' | 'none'` (and `last4` for `stored`) so the page can say which key the next run will use.

### Endpoints (consolidated: Vercel's free plan caps the number of functions, current count is 7)

- `api/auth.ts`: `GET` → `{ mode: 'stateless' | 'account', user: { username } | null }`; `POST ?action=signup|login|logout`.
- `api/key.ts`: `GET` (status), `PUT` (save/replace), `DELETE`.
- `api/history.ts`: `GET` (list: id, customer, files, counts, createdAt), `GET ?id=` (full entry), `POST` (create from a finished run, returns id), `PUT ?id=` (update `valid`), `DELETE ?id=`. `POST` and `PUT` validate the body with zod (already a dependency): shapes of `Req` (including optional `targets`, `wantsApi`), `FunctionCoverage`, `valid`, with bounded string lengths and array sizes; unknown fields are dropped. The server computes `counts` from `result` and takes `customer` and `files` from the body clamped to sane lengths. Each entry stores `schema` (the shape version, 1 now). `PUT` may update `valid` and `coverage` (coverage can be re-run later). Entries over 2 MB are rejected and the client shows "ไม่ได้บันทึกประวัติ: ผลใหญ่เกินไป" while still showing the results; a user keeps the newest 50, older ones are pruned in the same transaction as a save. Opening an entry runs it through a normaliser (missing optional fields default, older `schema` values are upgraded); an entry that fails validation shows "เปิดรายการนี้ไม่ได้" and can still be deleted.
- Existing endpoints (`extract`, `classify`, `judge`, `questions`, `kb`, `status`) go through `handle()`, which in account mode requires the session.

### Web

- Route `/login`: sign-in and sign-up (sign-up asks for the team code), Thai copy, inline errors. In account mode, every other route redirects to `/login` when there is no session; in stateless mode there is no login page effect.
- Header: username and sign-out. Sign-out calls the API and clears the persisted store (`result`, `review`, `coverage`, `valid`, `selId`, `customer`) and the in-memory key.
- The persisted store is stamped with the owning user id. On load in account mode: no stamp (data from the stateless era) → adopted by whoever signs in first on that browser, not saved to history automatically; a different user id, any 401 from the API, or a missing session → wiped. The app renders nothing but a skeleton until the first `GET /api/auth` returns, so stale data never flashes for the wrong person.
- AI settings (account mode): shows the stored key as provider · model · `••••last4` with Replace / Remove; saving sends the key once to `PUT /api/key` and clears it from page memory. `hasAi` is true when a stored key exists, so Run needs no key typed. In stateless mode this page is unchanged.
- History: route `/history` (nav item), list newest first with customer, date, file names, status counts; Open restores `result`, `coverage`, `valid` into the store and goes to the Matrix; Delete asks one inline confirmation. When `confirmReview` finishes in account mode the app saves the entry (`historyId` kept in the store); changing PM validation or re-running the open-question check updates it (debounced). Starting a new run, or opening another entry, resets `historyId`; a `PUT` that gets 404 (deleted or pruned) silently drops `historyId`.
- The existing "ล้างรายการ review" button keeps clearing only the pending review.

### Operator setup (documented in README)

1. Add a Postgres database from the Vercel Marketplace to the project (sets `DATABASE_URL`).
2. Set `KEY_ENCRYPTION_SECRET` (command in README) and `ACCESS_CODE` (the team sign-up code) in Vercel env.
3. Run `npm run db:init` once with `DATABASE_URL`. Reset a forgotten password with `npm run user:reset -- <username>` (prints a temporary password).

## Constraints

- No new service beyond the database; no email; Thai UI; existing UI components.
- Function body/time limits unchanged (60 s). scrypt cost chosen so a sign-in is ≈ 100 ms.
- Stateless mode and all existing tests keep working without a database.

## Calls I made (not agreed with the user)

Postgres via Vercel Marketplace / Neon, `pg` driver; auth endpoints consolidated into three files; private per-user history only; history keeps the 50 newest and rejects > 2 MB (storage on a small free database stays bounded: at most ~100 MB per user, typically far less); password ≥ 10 chars; 5 failures / 15 min throttle; no self-service reset in v1 (but change-password, disable/enable/delete user, and reset also kills sessions); sign-up gated by the existing `ACCESS_CODE`; `DATABASE_URL` as the mode switch; sign-out and any 401 clear the persisted store; unstamped old local data is adopted by the first user; a stored key that cannot be decrypted never falls back to the operator default.

## Left to the builder

SQL column types and index details; scrypt parameters within the stated target; the in-memory repository; exact Thai wording; how the client learns the mode on first load (one `GET /api/auth`); whether history save failures show a toast or an inline note (must not block showing results).

## Risks

- The shared sign-up code means anyone who has it can create an account; rotate `ACCESS_CODE` to close sign-up. Acceptable for an internal tool.
- We now hold passwords and encrypted keys: a leaked `KEY_ENCRYPTION_SECRET` together with a database dump exposes keys. Mitigation: keep the secret only in Vercel env, never in the repo or the client.
- History holds customer requirement text; it lives in the operator's database, private per user.
- Without a reset flow a forgotten password needs the operator.
