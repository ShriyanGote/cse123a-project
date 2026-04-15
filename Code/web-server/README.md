# Brita Water Level Web Server

Our Web App: https://cse123a-project-6a3s.vercel.app/

Our Webserver Github Repo: https://github.com/ShriyanGote/cse123a-project/tree/54d26662f9176a54d48d1e06c6b1f1091e2e5d16/Code/web-server

This app shows your latest pitcher level from Supabase and receives new sensor readings through `api/ingest.js`.
It can also send Web Push notifications when the water level is below 20%.

### Mobile / server API (Vercel)

The React Native app calls these routes instead of Supabase directly:

- `GET /api/app-state` — JSON `{ reading, calibration }` (latest row from `water_readings` and `calibration`).
- `POST /api/calibration` — JSON body may include any of `id`, `empty`, `full`; omitted fields are merged with the latest calibration row (same behavior as the web UI buttons).

Set `EXPO_PUBLIC_API_BASE_URL` in the Expo app (optional; defaults to the production URL in `src/api.js`).

## Local dev

Install dependencies:

`npm install`

Run the app:

`npm run dev`

## Testing

Run frontend tests:

`npm run test:run`

Run manual ingest with sample data:

Post sample data using the command below. You can modify the device_id, weight_g, and battery_mv variables in the command.

Make sure to replace `{INGEST-API-KEY}` with your actual key.

`curl -s -o /tmp/ingestDebug.out -w "HTTP %{http_code}\n" -X POST https://cse123a-project-6a3s.vercel.app/api/ingest -H "Content-Type: application/json" -H "x-api-key: {INGEST-API-KEY}" -d '{"device_id":"test-ingest-1","weight_g":1500,"battery_mv":3800}' && cat /tmp/ingestDebug.out`

Example output:

`HTTP 200`

`{"ok":true,"debug":{"currentPercent":44,"previousPercent":52,"crossedBelowThreshold":false,"subscriptionCount":0,"webPushConfigured":false,"sentCount":0,"failedCount":0}}`

The debug response includes current/previous percent, threshold crossing status, subscription count, and notification send success/failure counts.

## Notification Behavior

- Frontend requests notification permission, creates a Push API subscription, and registers it at `POST /api/register-token`.
- `POST /api/ingest` stores each reading, computes water level percent, and sends push alerts with `web-push` when a new water level is below 20%.