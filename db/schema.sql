-- Idempotent: safe to run again (npm run db:init).
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user on sessions(user_id);
create table if not exists api_keys (
  user_id uuid primary key references users(id) on delete cascade,
  provider text not null,
  model text not null,
  ciphertext bytea not null,
  iv bytea not null,
  tag bytea not null,
  last4 text not null,
  updated_at timestamptz not null default now()
);
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  customer text not null default '',
  files text[] not null default '{}',
  counts jsonb not null default '{}',
  schema int not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessments_user_created on assessments(user_id, created_at desc);
create table if not exists attempts (
  key text primary key,
  failures int not null,
  window_start timestamptz not null
);

-- Role: who may manage users. Added later, so it is an idempotent alter.
alter table users add column if not exists is_admin boolean not null default false;

-- Editable knowledge: notes, prompts and the taxonomy as items of one table; every change keeps a version.
create table if not exists kb_items (
  kind text not null,
  key text not null,
  data jsonb not null,
  edited_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);
create table if not exists kb_versions (
  id bigserial primary key,
  kind text not null,
  key text not null,
  data jsonb not null,
  edited_by text not null default '',
  at timestamptz not null default now()
);
create index if not exists kb_versions_item on kb_versions(kind, key, id desc);
create table if not exists kb_meta (
  key text primary key,
  value text not null
);
