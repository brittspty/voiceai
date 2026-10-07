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
- **Twilio.** Live mode checks the account. `POST /api/webhooks/twilio` maps `CallStatus` onto the call. ElevenLabs is what actually dials.

Webhook auth: HMAC-SHA256 of the raw body in `x-voiceops-signature`, or the shared secret in `x-webhook-secret`. Mock mode accepts unsigned bodies so the demo runs with empty secrets. Live mode rejects them.

Failed webhook handling and failed CRM writes land in **Settings → Failed jobs**, with retry and discard. Every change is in the activity log. Agent instructions, voice, and calling rules are versioned; publishing is owner-only.

## Marketing data layer

Read-only ad performance for this deployment. The canonical tables are platform-agnostic (accounts, campaigns, ad sets, ads, creatives and versions, audiences, daily metrics, sync runs). Meta payloads are also stored in `MarketingRawRecord` so a later source can be added without rewriting those tables. Google Ads, TikTok, and LinkedIn are reserved on the platform enum; only Meta is connected.

This app is still one database per client. `workspaceId` is stored on every marketing row and defaults to `org` (the same id as `Org`). It is not used to separate clients inside one database. Do not point two businesses at the same Postgres.

### Setup

Leave the Meta variables empty and the worker skips marketing sync. Nothing is called and no error is raised. To load labeled fixture rows instead:

```bash
MARKETING_SYNC_MODE=mock npm run marketing:sync
```

The Marketing screen shows a Mock data label when the latest run used fixtures. Open it from the sidebar after signing in.

A live sync needs a Meta system user token and the app that issued it:

| Variable | Use |
| --- | --- |
| `META_ACCESS_TOKEN` | System user token. Scopes: `ads_read` and, when granted, `read_insights`. Stored only as the pointer `env:META_ACCESS_TOKEN` |
| `META_APP_SECRET` | App secret. When this is set, every Graph call sends `appsecret_proof` (HMAC-SHA256 of the access token, keyed by this secret). Never written to the database |
| `META_APP_ID` | Meta app id that issued the token. Required for a live sync. Example: `1093413013101625` |
| `META_AD_ACCOUNT_IDS` | Comma-separated ad account ids for this deployment (`act_123` or `123`). One deployment can list several accounts. Example: `act_532471207924121` (Specificity Inc Marketing, USD, America/New_York). Other clients set their own ids. The code does not default to that account |
| `META_GRAPH_VERSION` | Graph version. Default `v23.0` |
| `META_ATTRIBUTION_WINDOWS` | Comma-separated windows sent to insights. Default `7d_click,1d_view`, stored as `7d_click_1d_view` |
| `MARKETING_SYNC_MODE` | `auto` (default), `mock`, `live`, or `off`. `auto` syncs when the token, app id, and app secret are set and at least one account is configured; otherwise it skips |
| `MARKETING_LOOKBACK_DAYS` | Trailing days re-pulled each run, from 1 to 90. Default 7. Late attribution is handled by upserting this window, not by a high-water mark |
| `MARKETING_SYNC_INTERVAL_MS` | Worker interval. Default 6 hours. The worker also syncs once on startup |
| `DATABASE_URL` | Postgres URL the CLI writes to. Required for `npm run meta:sync` unless you pass `--dry-run` |

When `META_AD_ACCOUNT_IDS` is set, that list is the only allow-list. When it is empty, the sync uses `AdAccount` rows with `syncEnabled` still true. Clearing the env var does not delete history. Set `MARKETING_SYNC_MODE=off` to stop all syncs. Accounts removed from the allow-list stay in the database and are not pulled while the env list is non-empty.

Set the same variables on the app and the worker, then restart the worker. `npm run marketing:sync` runs one sync in the foreground using `MARKETING_SYNC_MODE` (mock fixtures or a live pull).

To validate a real token outside this environment, run the read-only Meta CLI. It calls Graph with `appsecret_proof`, prints pulled row counts and any API errors as JSON, and writes the database unless `--dry-run` is set:

```bash
META_ACCESS_TOKEN=... META_APP_ID=1093413013101625 META_APP_SECRET=... \
  DATABASE_URL=postgresql://... \
  npm run meta:sync -- --account act_532471207924121 --days 30 --dry-run
```

`--account` accepts one id or a comma-separated list, and can be repeated. It overrides `META_AD_ACCOUNT_IDS` for that run. `--days` is the inclusive trailing window (1–90, default 7). The date window is computed in `America/New_York`. Omit `--dry-run` to upsert into `DATABASE_URL` and print a row count for each marketing table.

Insights run first, at ad level. Campaigns, ad sets, and ads are then loaded one edge at a time (not in parallel). Each list is filtered to rows updated since the window start and not archived or deleted. Delivered ids are loaded from the same account edge with `filtering` `IN` on `campaign.id`, `adset.id`, or `ad.id`, 50 ids at a time. The `ids` query parameter is not used. Ad rows ask only for `creative{id}`. Full creative fields, including `object_story_spec`, are a second pass on `/{account}/ads` filtered by `ad.id` IN, limit 25, and only for ads that delivered. Filtering `adcreative.id` is not supported. Ads that did not deliver stay on `creative{id}`.

If an edge fails, insights and any entities already loaded are still saved, and the report names the skipped edge. A skipped edge does not delete or replace rows already stored for parents that did not load. Delivered ids with no payload are placeholders: they are inserted only when that id is new, so a later metric can attach. An existing campaign, ad set, or ad is left as-is, including its audience links and raw payload. Audience links are replaced only for ad sets whose payload included `targeting`.

Graph list calls follow cursor pagination (100 rows per page, 200 pages max). A response that says to reduce the amount of data, or any 5xx, retries that page at half the limit (minimum 10). HTTP 429 and error codes 4, 17, 32, 613, and 80004 retry with `Retry-After` or exponential backoff. Code 17 with neither `Retry-After` nor `estimated_time_to_regain_access` waits 30 seconds, doubling up to 120 seconds. A short 1–8 second backoff was still inside the user-request limit, so the ad set edge was skipped after five tries. `estimated_time_to_regain_access` is waited out when it is greater than zero. High `total_cputime` / `call_count` with a zero regain time is a 5 second gap, not a minute per page, except for that code 17 backoff. Each page logs one stderr line: method, path with no query string, page number, rows so far, and the sleep reason and duration. The token and `appsecret_proof` are not logged. An account pull stops after 12 minutes instead of sleeping past that limit. A code 17 wait that would pass the cap stops the pull with a rate-limit error instead of treating the edge as empty.

An insights window longer than 7 days, or a short window that still times out at the minimum page size, is submitted as an async insights job. Polls back off from 5 seconds to 30 seconds.

Development access (`ads_api_access_tier: development_access`) keeps CPU usage near 100% from the first call, so a full ad archive will not finish. This pull stays on the delivering and recently updated set. Standard Access is required before syncing several accounts on the worker interval. A 30-day pull of one account stays small when the delivering set fits in one batch and insights return in a page or two: the account, one insights job, a few polls, the insight result pages, one filtered id batch each for campaigns, ad sets, and ads, one updated-since list page per edge, one ads call per 25 delivered ads for creative fields, and one audience list. Add a call per extra 50 ids and per extra insight page.

Daily rows are unique on workspace, date, platform, ad, audience segment, and attribution window. Running the sync again updates those rows in place. Reach is stored and shown per row; the screen does not add it up. Budgets are converted from Meta minor units into the account currency. Overlapping lead action types use the max value so the same leads are not counted twice. Creative versions are a SHA-256 of headline, body, description, CTA, media id, and landing path (query strings are ignored). The first time a fingerprint is seen it gets the next `vN` label for that concept and keeps it.

### Add a source

1. The `AdPlatform` enum already includes `google_ads`, `tiktok`, and `linkedin`. Add a new value only if the source is not in that list, and ship a migration with it.
2. Map the source's payloads into `NormalizedSnapshot` in a new file under `lib/marketing/connectors/`. Keep source-specific JSON in `MarketingRawRecord`.
3. Implement `AdPlatformConnector` and register it in `lib/marketing/connectors/registry.ts`. `applySnapshot` upserts the canonical tables; the new source should not need its own tables.
4. Read credentials from env vars at call time. If they are missing, skip. Do not hardcode an account id.
5. Add mapping tests and an idempotent sync test. Re-running the same snapshot must not insert duplicate daily rows.

### Deferred

Lead, call, and booking joins stay out of this module so dialing and consent are unchanged. Also deferred: targeting history (current include and exclude links are stored), a date dimension, campaign-name parsing, age/gender/placement breakdowns, currency conversion, an OAuth connect button, and the Google, TikTok, and LinkedIn connectors.

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
