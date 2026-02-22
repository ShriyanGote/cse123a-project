# Brita Water Level Web Server

This app shows your latest pitcher level from Supabase and receives new sensor readings through `api/ingest.js`.
It can also send Firebase Cloud Messaging (FCM) push notifications when the water level drops below 20%.

## Local dev

Install dependencies:

`npm install`

Run the app:

`npm run dev`

## Push notification setup (FCM)

### 1) Add environment variables

Client (Vite):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

Server/API:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INGEST_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (store with escaped newlines as `\\n`)

### 2) Create notification token table in Supabase

Run this SQL:

```sql
create table if not exists public.notification_tokens (
	token text primary key,
	updated_at timestamptz not null default now()
);
```

### 3) Configure Firebase web push

- In Firebase Console, create a Web App and enable Cloud Messaging.
- Generate a Web Push certificate key pair and set `VITE_FIREBASE_VAPID_KEY`.
- Generate a service account key and map values into
	`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

## Behavior

- Frontend requests notification permission and registers an FCM token at `POST /api/register-token`.
- `POST /api/ingest` stores each reading, computes water level percent, and sends push alerts when level crosses from >=20% to <20%.
- Invalid FCM tokens are automatically removed from `notification_tokens`.
