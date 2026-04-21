# Nafsoléa — API Reference

Base URL: `http://localhost:3000/api/v1`

All protected routes require: `Authorization: Bearer <accessToken>`

---

## Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Create patient or psychologist account |
| POST | `/auth/login` | Public | Returns `accessToken` + `refreshToken` |
| POST | `/auth/refresh` | Public | Rotate refresh token → new access token |
| POST | `/auth/logout` | JWT | Revoke refresh token |
| GET  | `/auth/verify-email?token=` | Public | Activate account |
| POST | `/auth/forgot-password` | Public | Send reset link |
| POST | `/auth/reset-password` | Public | Consume reset token + new password |

### Register body
```json
{
  "email": "patient@example.com",
  "password": "Secure1234!",
  "firstName": "Karim",
  "lastName": "Hadj",
  "role": "PATIENT",
  "timezone": "Europe/Paris",
  "gdprConsent": true
}
```

### Login response
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "hex_random_128_chars",
  "role": "PATIENT"
}
```

---

## Users (self)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET    | `/users/me` | JWT | Full profile (patient or psychologist) |
| PUT    | `/users/me` | JWT | Update patient profile |
| GET    | `/users/me/appointments` | JWT | Appointment history (`?status=CONFIRMED`) |
| GET    | `/users/me/notifications` | JWT | In-app notifications (`?unread=true`) |
| PUT    | `/users/me/notifications/read` | JWT | Mark notifications read |
| DELETE | `/users/me` | JWT | RGPD account deletion (anonymisation) |

---

## Psychologists

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET    | `/psychologists` | Public | Browse approved psychologists |
| GET    | `/psychologists/:id` | Public | Profile + public reviews |
| GET    | `/psychologists/:id/slots` | Public | Available booking slots |
| PUT    | `/psychologists/me/profile` | PSYCHOLOGIST | Update own profile |
| POST   | `/psychologists/me/availability` | PSYCHOLOGIST | Set weekly recurring schedule |
| POST   | `/psychologists/me/blocked-slots` | PSYCHOLOGIST | Block vacation / sick days |

### GET `/psychologists` query params
| Param | Type | Example |
|-------|------|---------|
| `language` | string | `ar`, `fr`, `en`, `ber` |
| `specialty` | string | `anxiety`, `trauma`, `couples` |
| `maxRate` | number | `80` |
| `page` | number | `1` |
| `limit` | number | `12` |

### GET `/psychologists/:id/slots` query params
| Param | Default | Description |
|-------|---------|-------------|
| `from` | today | Start date `YYYY-MM-DD` |
| `days` | `14` | Number of days to scan |

### Slots response
```json
[
  { "date": "2026-04-22", "time": "09:00", "datetime": "2026-04-22T07:00:00.000Z" },
  { "date": "2026-04-22", "time": "10:00", "datetime": "2026-04-22T08:00:00.000Z" }
]
```

---

## Appointments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST   | `/appointments` | PATIENT | Book slot → returns Stripe `clientSecret` |
| DELETE | `/appointments/:id` | JWT | Cancel (with auto-refund logic) |
| GET    | `/appointments/:id/video` | JWT | Get Daily.co room URL + token |
| POST   | `/appointments/:id/review` | PATIENT | Submit post-session review |

### Book body
```json
{
  "psychologistId": "clxyz...",
  "scheduledAt": "2026-04-22T09:00:00.000Z",
  "notes": "Je traverse une période difficile depuis mon arrivée en France…"
}
```

### Book response
```json
{
  "appointmentId": "clxyz...",
  "scheduledAt": "2026-04-22T09:00:00.000Z",
  "durationMinutes": 60,
  "expiresAt": "2026-04-22T07:15:00.000Z",
  "payment": {
    "clientSecret": "pi_xxx_secret_yyy",
    "amount": 65,
    "currency": "EUR"
  }
}
```

**Payment flow:** Use `clientSecret` with `stripe.confirmCardPayment()` on the frontend.
Stripe webhook (`payment_intent.succeeded`) → backend confirms appointment automatically.

### Video access response (join ≤15min before session)
```json
{
  "roomUrl": "https://nafsolea.daily.co/nafsolea-clxyz",
  "token": "eyJ..."
}
```

---

## Consultation Notes (psychologist only)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/appointments/:id/notes` | PSYCHOLOGIST | Read decrypted clinical note |
| PUT | `/appointments/:id/notes` | PSYCHOLOGIST | Create or update clinical note |

Notes are stored **AES-256-GCM encrypted**. Only the psychologist who conducted the session can access them.

---

## Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST   | `/payments/webhook` | Public (Stripe) | Stripe webhook — raw body |
| GET    | `/payments/appointments/:id` | PATIENT | Payment status + receipt URL |

---

## Admin (`/admin/*` — ADMIN role only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/admin/dashboard` | Stats: users, revenue, appointments |
| GET    | `/admin/psychologists/pending` | List profiles awaiting validation |
| POST   | `/admin/psychologists/:id/approve` | Validate psychologist |
| POST   | `/admin/psychologists/:id/reject` | Reject with reason |
| GET    | `/admin/users` | Paginated user list (`?search=karim`) |
| PATCH  | `/admin/users/:id/suspend` | Suspend user + revoke tokens |
| GET    | `/admin/appointments` | All appointments (`?status=CONFIRMED`) |
| GET    | `/admin/revenue` | Revenue report (`?from=2026-01-01&to=2026-04-30`) |
| GET    | `/admin/audit-logs` | Security audit trail (`?userId=xxx`) |

---

## Error format

```json
{
  "statusCode": 400,
  "message": "Données invalides",
  "errors": ["email must be an email", "password is too short"],
  "timestamp": "2026-04-21T10:00:00.000Z",
  "path": "/api/v1/auth/register"
}
```

---

## Appointment status machine

```
PENDING_PAYMENT  ──(payment.succeeded)──▶  CONFIRMED
     │                                         │
     │ (15min timeout)                          │ (patient/psy)
     ▼                                          ▼
  EXPIRED                             CANCELLED_BY_PATIENT
                                      CANCELLED_BY_PSYCHOLOGIST
                                             │
                                    CONFIRMED ──(session start)──▶ IN_PROGRESS
                                                                         │
                                                                  COMPLETED
```

## Refund policy (automatic)
- Cancelled by psychologist → **100% refund**
- Cancelled by patient >24h before → **100% refund**
- Cancelled by patient <24h before → **50% refund**
