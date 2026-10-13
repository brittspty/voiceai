# Voice Operations

Outbound voice-AI operations for Specificity Inc. A configurable agent calls leads synced from GoHighLevel, speaks through ElevenLabs over a Twilio number, and books meetings onto an office calendar. The default seed is a Specificity workspace (company, agent, offices, and knowledge come from the environment). Each client business gets its own server and database. There is no shared multi-tenant app.

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
| Owner | alex.rivera@specificityinc.example | VoiceOps!owner | Off |
| Admin | jordan.lee@specificityinc.example | VoiceOps!admin | Off |
| Viewer | sam.patel@specificityinc.example | VoiceOps!viewer | Off |

These are the defaults when the `SEED_*` variables are unset. Override names, emails, and passwords before the first seed. The seed does not reset an existing workspace. Admin and viewer are created only when `SEED_SAMPLE_DATA` is true. A production seed with `SEED_SAMPLE_DATA=false` creates only the owner, with two-step sign-in off. On a localhost `APP_URL` the sign-in page shows this hint. A public `APP_URL` hides it unless `SHOW_DEMO_LOGIN=true`.

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

Covers the pre-dial gates (consent tier, revocation, the `avery_dial_ok` tag, do-not-call, local hours and timezone, daily cap, retry limit), the dial-then-CRM pipeline, Twilio signature checks, inbound TwiML, call-status updates, webhook parsing, TOTP, and the production checklist.

## Environment

See `.env.example`. Secrets are only read from the environment. Do not commit `.env`.

| Variable | Use |
| --- | --- |
| `DATABASE_URL`, `REDIS_URL` | Postgres and Redis |
| `SESSION_SECRET` | Signs the session cookie |
| `INTEGRATIONS_MODE` | `mock` (default) or `live` |
| `APP_URL` | Public origin Twilio calls, and the origin used in webhook instructions. Signature checks use this origin plus the request path, not the proxy's internal host |
| `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET` | GoHighLevel. Contact fields `consent_tier` and `consent_revoked`, and the tag `avery_dial_ok`, feed the voice consent gate |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID`, `ELEVENLABS_WEBHOOK_SECRET` | ElevenLabs outbound calls and, when live with test mode off, inbound register-call. Mock or test mode plays a short message and hangs up |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Twilio account check. `TWILIO_AUTH_TOKEN` also verifies `X-Twilio-Signature` on the voice webhook |
| `TWILIO_WEBHOOK_SECRET` | Optional. Internal callers only (`x-webhook-secret` or `x-voiceops-signature`). Twilio itself uses the auth token signature |
| `WORKER_STEP_MS` | Pause between dial states so the live board can show them. `0` skips the pause |
| `SEED_ORG_NAME`, `SEED_ORG_SUBTITLE`, `SEED_AGENT_NAME`, `SEED_TIMEZONE` | Workspace identity applied on the first seed. Defaults: Specificity Inc, Voice Ops, Avery, America/New_York |
| `SEED_OFFICES` | `Name\|office\|Timezone;Name\|virtual`. Default: Main office and Virtual, both in `SEED_TIMEZONE` |
| `SEED_BRAND_COLOR`, `SEED_LOGO_URL`, `SEED_MARK` | Mark color (`#2563eb`), optional http(s) logo, and the letter used when no logo is set (`V`) |
| `SEED_KNOWLEDGE_TITLE`, `SEED_KNOWLEDGE_PATH` | Knowledge document. A path replaces the default script. A missing file stops the seed |
| `SEED_OWNER_NAME`, `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` | Owner created on the first seed. Admin and viewer use the same `SEED_ADMIN_*` and `SEED_VIEWER_*` shape, and are created only when `SEED_SAMPLE_DATA` is true |
| `SEED_SAMPLE_DATA` | `true` (default) fills Calls and Overview with sample leads and creates the admin and viewer. `false` leaves an empty dialer and creates only the owner |
| `SHOW_DEMO_LOGIN` | `true` or `false`. Unset shows the demo hint only when `APP_URL` is localhost |

## How the integrations are wired

Adapters live in `lib/adapters`. `getPorts()` returns mocks when `INTEGRATIONS_MODE` is not `live` or the workspace test-mode switch is on.

- **GoHighLevel.** `POST /api/webhooks/ghl` accepts a contact or appointment event. With the schedule on, a new lead becomes a dial job. After a call, a CRM job writes a note and a tag to `https://services.leadconnectorhq.com`. Health checks `GET /locations/{id}`.
- **ElevenLabs.** The worker places the call with `POST /v1/convai/twilio/outbound-call`. `POST /api/webhooks/elevenlabs` stores the transcript, outcome, duration, and cost. In mock mode the adapter returns those immediately.
- **Twilio voice.** Live mode checks the account. `POST /api/webhooks/twilio` is the voice webhook and the status callback. Twilio's own posts must carry a valid `X-Twilio-Signature` (HMAC-SHA1 of the public URL plus the sorted form fields, keyed with `TWILIO_AUTH_TOKEN`). `APP_URL` is the origin used for that check when the app sits behind a proxy. Internal callers can still use `x-webhook-secret` or `x-voiceops-signature`. Voice requests get TwiML. An inbound call is logged. If integrations are live, test mode is off, and the ElevenLabs agent id and API key are set, the webhook registers the call with ElevenLabs and returns that TwiML. Otherwise it speaks a short message and hangs up. Status events `initiated`, `ringing`, `answered` (and `in-progress`), `completed`, `busy`, `no-answer`, `failed`, and `canceled` update the call record and ignore repeats or older events. This app does not send SMS.
- **Consent.** GoHighLevel contact fields `consent_tier` (`low`, `medium`, `high`) and `consent_revoked`, plus the tag `avery_dial_ok` when it is present, are stored on the contact. Avery's outbound voice calls need tier medium or high and must not be revoked. Low or none is blocked. Do-not-call, calling hours, the daily cap, and the retry limit still apply. A medium call passes `consent_scope` `scheduling only` to ElevenLabs. A high call passes `product/service conversation`.

Webhook auth for GoHighLevel and ElevenLabs: HMAC-SHA256 of the raw body in `x-voiceops-signature`, or the shared secret in `x-webhook-secret`. Mock mode accepts unsigned bodies so the demo runs with empty secrets. Live mode rejects them. Twilio voice uses the signature above; the shared-secret headers on that route are for internal callers only.

Failed webhook handling and failed CRM writes land in **Settings → Failed jobs**, with retry and discard. Every change is in the activity log. Agent instructions, voice, and calling rules are versioned; publishing is owner-only.

## Switch from test to live

1. Put real keys in the environment. Rotate the Twilio token. Use a fresh ElevenLabs key.
2. Set `INTEGRATIONS_MODE=live` on both the app and the worker, then restart them.
3. Point each vendor at the HTTPS webhook URLs.
4. Sign in as an owner. On **Production ready**, turn test mode off only when the list is green, then turn the schedule on for a small pilot.

Until both switches move, dials stay simulated.

## New client deployment

One client, one server, one database. Do not point two businesses at the same Postgres. Copy this repository as-is. Branding does not require a code change.

The first server is Specificity Inc at `https://voiceai.specificityinc.com`. Later clients repeat the same [single-server AWS setup](DEPLOY-AWS.md) with their own domain, `.env`, and empty database.

1. Create the server from `infra/aws` (or the Lightsail path in DEPLOY-AWS.md). Set `domain` to the client's hostname. For Specificity that is `voiceai.specificityinc.com`. Point the A record at the instance and wait until it resolves.
2. Copy the repo to `/opt/voiceops` and create `/opt/voiceops/.env` with mode `600` before the first boot. The app container runs migrations and the seed on startup, and the seed will not overwrite a workspace that already exists.
3. Set `APP_URL=https://<domain>`, `SITE_ADDRESS=<domain>`, and a long `SESSION_SECRET`.
4. Set the workspace before the first start: `SEED_ORG_NAME`, `SEED_ORG_SUBTITLE`, `SEED_AGENT_NAME`, `SEED_TIMEZONE`, `SEED_OFFICES`, `SEED_BRAND_COLOR`, `SEED_LOGO_URL`, `SEED_MARK`. Put the client's script in a file and set `SEED_KNOWLEDGE_PATH`, or edit the default document after sign-in.
5. Set `SEED_SAMPLE_DATA=false` and real `SEED_OWNER_*` values for the operator who will sign in. Admin and viewer are demo accounts and are created only when sample data is on. Set `SHOW_DEMO_LOGIN=false`. Turn on two-step sign-in in the app after the first sign-in.
6. Leave vendor keys empty and `INTEGRATIONS_MODE=mock` until the pilot. Keys stay in `.env` or SSM under `/voiceops/prod/`. Never commit them.
7. Start the stack: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`. Confirm `https://<domain>/api/health`.
8. Sign in as the owner. Check the sidebar name, the mark, Settings → Agent, Settings → Offices, and Knowledge. Replace sample hours (Friday 10:00–17:00) and calendar names. Add the client's users and turn on two-step sign-in.
9. Point GoHighLevel, ElevenLabs, and Twilio at `https://<domain>/api/webhooks/ghl`, `/api/webhooks/elevenlabs`, and `/api/webhooks/twilio`.
10. Go live with the steps in DEPLOY-AWS.md: live keys, `INTEGRATIONS_MODE=live`, restart app and worker, then turn test mode off only when Production ready is green.

After the first seed, change the company name, subtitle, timezone, color, logo, and mark in **Settings → Agent**. Change the agent script, offices, and knowledge in the app. Changing `SEED_*` later does not update an existing database. To start over, use an empty database and boot again.

## Deploy

Local and production both use Docker Compose. The pilot target is one small AWS server (a `t4g.small` or a Lightsail instance) with Caddy for HTTPS and nightly Postgres dumps to S3. See [DEPLOY-AWS.md](DEPLOY-AWS.md). That document also says when to move the database to RDS and the app to ECS. Duplicate that server per client. Do not add a second tenant to the same database.
