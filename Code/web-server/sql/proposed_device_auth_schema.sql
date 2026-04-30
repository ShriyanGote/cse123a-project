-- Proposed schema additions for device provisioning + JWT/JWE verification.
-- This file is proposal-only and is not auto-applied.

create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  auth_token text,
  device_name text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  jwk_kid text not null,
  public_jwk jsonb not null,
  alg text not null default 'ES256',
  enc text not null default 'A256GCM',
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (device_id, jwk_kid)
);

create table if not exists public.device_user_bindings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  bound_by uuid not null references auth.users(id) on delete cascade,
  bound_at timestamptz not null default now(),
  unique (device_id, user_id)
);

create table if not exists public.provisioning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.token_replay_guard (
  jti text primary key,
  subject_type text not null check (subject_type in ('user', 'device')),
  subject_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.api_audit_log (
  id bigint generated always as identity primary key,
  route text not null,
  subject_type text not null check (subject_type in ('user', 'device')),
  subject_id text,
  outcome text not null check (outcome in ('allow', 'deny')),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.devices enable row level security;
alter table public.device_credentials enable row level security;
alter table public.device_user_bindings enable row level security;
alter table public.provisioning_sessions enable row level security;
alter table public.token_replay_guard enable row level security;
alter table public.api_audit_log enable row level security;

-- Minimal user-safe read policies. Server service role bypasses RLS.
drop policy if exists "users_can_read_bound_devices" on public.devices;
create policy "users_can_read_bound_devices"
on public.devices
for select
to authenticated
using (
  exists (
    select 1
    from public.device_user_bindings b
    where b.device_id = devices.id
      and b.user_id = auth.uid()
  )
);

drop policy if exists "users_can_read_own_bindings" on public.device_user_bindings;
create policy "users_can_read_own_bindings"
on public.device_user_bindings
for select
to authenticated
using (user_id = auth.uid());
