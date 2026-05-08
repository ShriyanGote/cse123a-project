# Custom BLE provisioning (CSE 123A)

Firmware replaces Espressif `wifi_prov_scheme_ble` with a small NimBLE GATT server.

## Build

Requires [ESP-IDF](https://docs.espressif.com/projects/esp-idf/) 5.1+ (test with your installed version).

```bash
cd Code/ESP32/provisioning/custom_ble_prov
idf.py set-target esp32
idf.py fullclean
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

## Configuration

- **API URL**: edit `CSE123A_API_BASE` in `main/main.c` (default matches the deployed Vercel app in this repo).
- **UUIDs**: 128-bit service and characteristics match `ProvisionDeviceScreen.js` defaults (`a0b40001…`–`a0b40004…`).
- **Partition size**: this project uses `partitions.csv` with a 2MB factory app partition (default 1MB is too small for this binary).

## Behavior

1. On boot, Wi‑Fi STA is initialized (not associated). BLE advertises with name `ESP32_XXXXXX` (MAC-based).
2. Serial logs print QR JSON: `{"device_name":"…","device_id":"…"}` (same as on-screen QR if your board supports the component).
3. Mobile app writes **AUTH** (base64 JSON `{"auth_token":"<uuid>"}`) then **WIFI** (base64 JSON `{"ssid":"…","password":"…"}`).
4. **STATUS** notifies: `auth_ok`, `wifi_connecting`, `wifi_connected` / `wifi_failed`.
5. After DHCP, firmware POSTs `POST /api/ingest` with `Authorization: Bearer <auth_token>` and body `device_id`, `weight_g`, `battery_mv`.

Apply `Code/web-server/sql/migration_devices_ble_columns.sql` in Supabase so `devices.auth_token` exists before relying on ingest.
