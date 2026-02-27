# Brita Water Level Web Server

This app shows your latest pitcher level from Supabase and receives new sensor readings through `api/ingest.js`.
It can also send Firebase Cloud Messaging (FCM) push notifications when the water level drops below 20%.

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

`{"ok":true,"debug":{"currentPercent":44,"previousPercent":52,"crossedBelowThreshold":false,"tokenCount":0,"firebaseConfigured":false,"sentCount":0,"failedCount":0}}`

The debug response includes current/previous percent, threshold crossing status, token count, and notification send success/failure counts.

## Notification Behavior

- Frontend requests notification permission and registers an FCM token at `POST /api/register-token`.
- `POST /api/ingest` stores each reading, computes water level percent, and sends push alerts when level crosses from >=20% to <20%.