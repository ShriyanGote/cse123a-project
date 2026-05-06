-- Adds account-level activation flag to profiles.
-- Used by the web Settings page so a user whose phone is lost
-- can deactivate their account remotely (and reactivate later).

alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Allow a user to read their own profile row (Realtime needs a SELECT
-- policy for the row to be delivered to subscribers).
drop policy if exists "users_can_read_own_profile" on public.profiles;
create policy "users_can_read_own_profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());
