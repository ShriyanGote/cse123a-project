-- Supports user-scoped Expo push tokens while keeping legacy web-push rows.
alter table notification_tokens
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists provider text not null default 'webpush',
  add column if not exists platform text,
  add column if not exists enabled boolean not null default true,
  add column if not exists last_seen_at timestamptz;

update notification_tokens
set provider = coalesce(provider, 'webpush'),
    enabled = coalesce(enabled, true)
where true;

create index if not exists idx_notification_tokens_user_id
  on notification_tokens(user_id);

create index if not exists idx_notification_tokens_provider
  on notification_tokens(provider);

create unique index if not exists idx_notification_tokens_provider_token
  on notification_tokens(provider, token);
