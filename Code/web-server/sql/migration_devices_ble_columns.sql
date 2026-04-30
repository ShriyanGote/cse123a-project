-- Run in Supabase SQL editor (or psql) if you already created `devices` from proposed_device_auth_schema.sql.
-- Adds BLE simple-provisioning fields used by POST /api/devices/ble-register and Bearer auth_token on /api/ingest.

alter table public.devices
  add column if not exists auth_token text;

alter table public.devices
  add column if not exists device_name text;

comment on column public.devices.auth_token is 'Plain provisioning token from mobile app; ESP sends same value as Bearer on ingest. Rotate for production hardening.';
comment on column public.devices.device_name is 'Human-readable label from QR / registration.';
