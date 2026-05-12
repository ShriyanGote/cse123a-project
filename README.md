# 123a-project: Smart Pitcher Base

This repo contains all the code, hardware notes, and documentation for our Smart Pitcher Base project. The system is made up of three pieces:

1. **ESP32C3 firmware** — reads the load cell (HX711) on the pitcher base and POSTs readings to the web server.
2. **Web server / dashboard** — a Vite + React app (deployed on Vercel) that ingests readings into Supabase. Account sign-in and a setup guide live at https://cse123a-project-6a3s.vercel.app/.
3. **Mobile app** — an Expo / React Native app that talks to the web server, displays the water level, and receives low-water push notifications.

Everything lives under [`Code/`](Code). Each sub-project has its own README with run instructions.

```
Code/
├── ESP32/         # firmware (ESP-IDF)
├── web-server/    # Vite + React dashboard + Vercel API routes
├── mobile-app/    # Expo / React Native app
└── 3D Designs/    # printable parts for the base
```

---

# Other things in this repo

- [Documentation/](Documentation) — write-ups and design docs
- [Hardware Notes/](Hardware%20Notes) — schematics, PCB revisions, wiring notes
- [HardwarePicture/](HardwarePicture) — photos of the assembled hardware
- [Meeting Notes/](Meeting%20Notes) — weekly meeting notes
- [Status Updates/](Status%20Updates) — milestone / status reports
- [Code/Links to Test Cases.md](Code/Links%20to%20Test%20Cases.md) — index of test cases
- `git-contribution-report.sh` + `aliases.json` + `folders.json` — helpers for generating per-author contribution metrics
