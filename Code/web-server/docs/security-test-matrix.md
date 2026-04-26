# Security Test Matrix

## Automated

- `api/_lib/auth.test.js`
  - Bearer parsing
  - Nested JWE + JWT verification
  - Replay rejection (`jti` reuse)

Run:

```bash
cd Code/web-server
npm run test:run
```

## Manual API verification checklist

1. **User JWT accepted**
   - Sign in from mobile/web and call `GET /api/app-state` with Bearer token.
   - Expect `200`.
2. **User JWT rejected**
   - Remove `Authorization` header.
   - Expect `401`.
3. **Device nested JWE/JWT accepted**
   - Call `POST /api/ingest` using valid nested token.
   - Expect `200` and insert row in `water_readings`.
4. **Replay blocked**
   - Replay same device token (`jti` unchanged).
   - Expect `401` replay rejection.
5. **Expired token blocked**
   - Use device/user token with past `exp`.
   - Expect `401`.
6. **Provision start/complete**
   - `POST /api/auth/provision-start` with user token returns `session_id` and `nonce`.
   - `POST /api/auth/provision-complete` stores `devices`, `device_credentials`, and `device_user_bindings`.
7. **Mobile refresh behavior**
   - Keep mobile app open on group/dashboard.
   - Submit valid ingest payload to server.
   - Confirm water level updates on the next refresh cycle.
