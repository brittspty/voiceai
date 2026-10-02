# Voice Operations

Outbound voice-AI operations for Specificity Inc. A configurable agent (Karen in the sample tenant) calls leads synced from GoHighLevel, speaks through ElevenLabs over a Twilio number, and books meetings onto an office calendar. The sample workspace is Capital Financial so the screens match the original product.

Test mode is on by default. Consent, do-not-call, the lead’s local calling window, and the daily cap are on by default. No vendor account is required to run the seeded demo.

## Run it locally

Node 22, plus Postgres and Redis. Docker Compose brings those up:

```bash
cp .env.example .env
# .env.example points at the Compose ports (54329 / 63799).
docker compose up --build
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Without Docker, point `DATABASE_URL` and `REDIS_URL` at your own Postgres and Redis, then:

```bash
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
npm run worker
```

The dev server listens on port **43123**. The worker is a second process. It claims dial and CRM jobs from Postgres and uses Redis only as a wake-up signal. If Redis is down, it polls Postgres.

### Demo sign-in

| Role | Email | Password | Two-step |
| --- | --- | --- | --- |
| Owner | alex.rivera@capitalfinancial.example | VoiceOps!owner | Off |
| Admin | jordan.lee@capitalfinancial.example | VoiceOps!admin | On. Secret `JBSWY3DPEHPK3PXP` |
| Viewer | sam.patel@capitalfinancial.example | VoiceOps!viewer | Off |

Override the passwords with `SEED_OWNER_PASSWORD`, `SEED_ADMIN_PASSWORD`, and `SEED_VIEWER_PASSWORD` before the first seed. The seed does not reset an existing workspace.

## What you can click

- Overview: today’s KPIs, a live queue that refreshes every 4 seconds, the 7-day dial chart, outcomes, connect rate, booking funnel, recent calls.
- Calls: all calls, appointments, calendar, contacts, do-not-call, CRM tags and availability, voice. Search, filters, a column picker, and 20 rows a page. A row opens the call drawer (transcript, recording, consent, cost, timeline).
- Knowledge: the live sample document, plus drafts you can publish.
- Settings: call eligibility, versioned agent instructions, voice, calling rules, offices, users and two-step sign-in, capability switches, integration health, the activity log, failed jobs, the test console, and the production checklist.

Place a test call from **Settings → Test console**. Preflight runs the same gates as a live dial. If it passes, the worker moves the call through queued → dialing → in progress → wrap-up → completed, writes a transcript, and queues a mocked GoHighLevel note. The call shows on Overview and Calls. Choose “Booked” to also create an appointment.

## Tests

```bash
npm test
```

Covers the pre-dial gates (consent, do-not-call, local hours and timezone, daily cap, retry limit), the dial-then-CRM pipeline, webhook parsing and signatures, TOTP, and the production checklist.

## Environment

See `.env.example`. Secrets are only read from the environment. Do not commit `.env`.

| Variable | Use |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | Postgres and Redis |
| `SESSION_SECRET` | Signs the session cookie |
| `INTEGRATIONS_MODE` | `mock` (default) or `live` |
| `APP_URL` | Public origin, used in webhook instructions |
| `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET` | GoHighLevel |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID`, `ELEVENLABS_WEBHOOK_SECRET` | ElevenLabs outbound calls |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WEBHOOK_SECRET` | Twilio account check and status callbacks |
| `WORKER_STEP_MS` | Pause between dial states so the live board can show them. `0` skips the pause |

## How the integrations are wired

Adapters live in `lib/adapters`. `getPorts()` returns mocks when `INTEGRATIONS_MODE` is not `live` or the workspace test-mode switch is on.

- **GoHighLevel.** `POST /api/webhooks/ghl` accepts a contact or appointment event. With the schedule on, a new lead becomes a dial job. After a call, a CRM job writes a note and a tag to `https://services.leadconnectorhq.com`. Health checks `GET /locations/{id}`.
- **ElevenLabs.** The worker places the call with `POST /v1/convai/twilio/outbound-call`. `POST /api/webhooks/elevenlabs` stores the transcript, outcome, duration, and cost. In mock mode the adapter returns those immediately.
- **Twilio.** Live mode checks the account. `POST /api/webhooks/twilio` maps `CallStatus` onto the call. ElevenLabs is what actually dials.

Webhook auth: HMAC-SHA256 of the raw body in `x-voiceops-signature`, or the shared secret in `x-webhook-secret`. Mock mode accepts unsigned bodies so the demo runs with empty secrets. Live mode rejects them.

Failed webhook handling and failed CRM writes land in **Settings → Failed jobs**, with retry and discard. Every change is in the activity log. Agent instructions, voice, and calling rules are versioned; publishing is owner-only.

## Switch from test to live

1. Put real keys in the environment. Rotate the Twilio token. Use a fresh ElevenLabs key.
2. Set `INTEGRATIONS_MODE=live` on both the app and the worker, then restart them.
3. Point each vendor at the HTTPS webhook URLs.
4. Sign in as an owner. On **Production ready**, turn test mode off only when the list is green, then turn the schedule on for a small pilot.

Until both switches move, dials stay simulated.

## Deploy

Local and production both use Docker Compose. The pilot target is one small AWS server (a `t4g.small` or a Lightsail instance) with Caddy for HTTPS and nightly Postgres dumps to S3. See [DEPLOY-AWS.md](DEPLOY-AWS.md). That document also says when to move the database to RDS and the app to ECS.
