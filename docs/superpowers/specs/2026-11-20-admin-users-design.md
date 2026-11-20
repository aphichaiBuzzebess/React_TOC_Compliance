# Admin: user management page — short design

Date: 2026-11-20 · Status: awaiting review
Builds on: `2026-11-20-accounts-keys-history-design.md` (accounts, sessions, CLI user commands).

## Intent

Today an operator manages users only with `npm run user:reset|disable|enable|delete` and a `DATABASE_URL` on their machine. The user wants a page inside the app where an admin does this, so nobody needs a terminal.

## Goals

- A role `admin` on a user. Only admins see and can use the **Users** page and its API.
- The page lists users and lets an admin: **disable / enable**, **reset password** (a temporary password is shown once), **delete** (with the user's key and history), **promote / demote** another user.
- Every user can **change their own password** (the temporary password from a reset must be replaceable).
- The first admin is made with one CLI command (`npm run user:promote -- <username>`), because nobody can promote the first one from the page.

## Non-goals

Audit log, per-user usage/cost, seeing anyone's history or key (never), self-service forgot-password by email, invites, groups/roles beyond admin/user, forcing a password change at next sign-in.

## Anti-goals

- A non-admin reaching any admin action (checked on the server for every call, not just hidden in the UI).
- Locking everyone out: an admin cannot demote, disable or delete **themselves**, and the **last remaining admin** can never be demoted, disabled or deleted.
- A temporary password stored or logged anywhere, or shown a second time.

## Approaches

- **A. Role column + admin API + page (chosen).** `users.is_admin`, one new function `api/admin.ts`, one new page. Small, uses the existing session and CSRF handling.
- **B. Admin = whoever knows an `ADMIN_CODE` env.** No role in the database, but a shared secret for admin actions: no per-person accountability and the code travels with every action. Rejected.
- **C. Keep CLI only.** Already works; does not meet the request.

## Design

- **Data:** `alter table users add column if not exists is_admin boolean not null default false` appended to `db/schema.sql` (idempotent, so `npm run db:init` upgrades the live database; no data loss). `User` gains `isAdmin`.
- **Db interface:** `listUsers(): { id, username, isAdmin, disabled, createdAt, hasKey, entries }[]` (counts only, no keys, no history content), `setAdmin(userId, bool)`, `countAdmins()`, `userById(id)`. Memory twin updated; the Postgres integration test covers the new queries.
- **API `api/admin.ts`** (function count becomes 10): all actions require a session whose user is an admin, else 403.
  - `GET` → `{ users }`.
  - `POST ?action=disable|enable|promote|demote|reset|delete` with `{ id }`.
  - Guards: a target must exist (404); `disable`, `demote`, `delete` on yourself → 400; `demote`, `disable`, `delete` of the last admin → 400. `reset` returns `{ temp }` once (random 16 chars, hashed before storing), and deletes all that user's sessions. `disable` and `delete` also end their sessions. `reset` on yourself is allowed.
  - `GET /api/auth` also returns `admin: boolean` so the client can show the menu item.
- **CLI:** add `user:promote` and `user:demote` to `scripts/user-admin.ts` (same last-admin guard on demote).
- **Web:** route `/admin` (nav item "Users", shown only when `admin` is true; non-admins who open the URL are sent home). Table: username, role, created, status, has key, saved reviews; buttons per row with the safe ones inline and **delete** and **reset** behind one inline confirmation. After reset, a one-time panel shows the temporary password with a copy button and a note to tell the person to change it. Thai text, existing components.
- **Change own password:** a "เปลี่ยนรหัสผ่าน" card on the AI settings page in account mode (current + new password) calling the existing `POST /api/auth?action=password`.
- **Tests:** non-admin gets 403 on every admin action; each guard (self, last admin, unknown id); reset returns a working temp password once and ends sessions; delete cascades key and history; list contains no key or history content; UI hides Users for non-admins and redirects the URL; change-password form (wrong current, success).

## Calls I made (not agreed with the user)

Role stored in the database; a temporary password shown once on screen rather than emailed; no forced change on next sign-in (a nudge text only); no audit log; admins cannot see other users' keys or history; promote/demote available both in the page and the CLI.

## Left to the builder

Column widths and mobile layout of the table, exact Thai wording, how the copy button reports success.
