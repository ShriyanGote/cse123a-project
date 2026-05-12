# Water Level Web Server

Our Web App: https://cse123a-project-6a3s.vercel.app/

Our Webserver Github Repo: https://github.com/ShriyanGote/cse123a-project/tree/54d26662f9176a54d48d1e06c6b1f1091e2e5d16/Code/web-server

This app shows your latest pitcher level from Supabase and receives new sensor readings through `api/ingest.js`.
It can also send low-water notifications via Expo push when the water level is below 20%.

### Mobile / server API (Vercel)

The React Native app calls these routes instead of Supabase directly:

- `GET /api/app-state` — JSON `{ reading, calibration }` (latest row from `water_readings` and `calibration`).

Set `EXPO_PUBLIC_API_BASE_URL` in the Expo app (optional; defaults to the production URL in `src/api.js`).

## Local dev

Install dependencies:

`npm install`

Run the app:

`npm run dev`

## Testing

Run frontend tests:

`npm run test:run`

## Notification Behavior

- `POST /api/ingest` stores each reading, computes water level percent, and sends low-water alerts via Expo push to tokens registered by the mobile app.