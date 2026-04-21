# Nafsoléa Backend — Setup Guide

## Prerequisites
- Node.js 20+
- Docker + Docker Compose (for local PostgreSQL + Redis)
- A Stripe account (test keys)
- A Daily.co account (free tier supports up to 4 concurrent rooms)

---

## 1. Install dependencies

```bash
cd backend
npm install
```

---

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your actual keys:
- Generate JWT secrets: `openssl rand -base64 64`
- Generate encryption key: `openssl rand -hex 32`
- Add Stripe test keys from dashboard.stripe.com
- Add Daily.co API key from dashboard.daily.co

---

## 3. Start infrastructure (PostgreSQL + Redis)

```bash
docker-compose up postgres redis -d
```

---

## 4. Run database migrations + seed

```bash
npm run db:migrate      # creates tables
npm run db:seed         # creates admin + sample data
```

---

## 5. Start development server

```bash
npm run start:dev
```

API runs at: `http://localhost:3000/api/v1`

---

## 6. Configure Stripe webhook (local dev)

Install the Stripe CLI and forward webhooks:

```bash
stripe listen --forward-to localhost:3000/api/v1/payments/webhook
```

Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` in `.env`.

---

## 7. Connect frontend

In your HTML pages, update API calls to point to `http://localhost:3000/api/v1`.

### Example: load psychologists
```js
const res = await fetch('http://localhost:3000/api/v1/psychologists?language=ar&limit=6');
const { data } = await res.json();
```

### Example: book appointment
```js
// 1. Book → get Stripe clientSecret
const { payment } = await fetch('/api/v1/appointments', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ psychologistId, scheduledAt, notes })
}).then(r => r.json());

// 2. Confirm payment with Stripe.js
const stripe = Stripe('pk_test_...');
await stripe.confirmCardPayment(payment.clientSecret, {
  payment_method: { card: cardElement }
});
// → Stripe webhook fires → appointment confirmed automatically
```

---

## Production deployment (Railway / Render / AWS)

1. Push to Git
2. Set all env variables in your cloud provider
3. Run `npm run db:migrate:prod` as a deploy step
4. Build: `npm run build` → `npm start`

Or use the provided `Dockerfile`:
```bash
docker build -t nafsolea-api .
docker run -p 3000:3000 --env-file .env nafsolea-api
```

---

## Admin access

After seeding, log in with:
- Email: `admin@nafsolea.com`
- Password: `Admin1234!`

The admin panel endpoints are at `/api/v1/admin/*`.
