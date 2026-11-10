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
| Owner | alex.rivera@specificityinc.example | Owner-setup-2026!change | Off |
| Admin | jordan.lee@specificityinc.example | Admin-setup-2026!change | Off |
| Viewer | sam.patel@specificityinc.example | Viewer-setup-2026!change | Off |

These are the defaults when the `SEED_*` variables are unset. Override names, emails, and passwords before the first seed. The seed does not reset an existing workspace. Admin and viewer are created only when `SEED_SAMPLE_DATA` is true. A production seed with `SEED_SAMPLE_DATA=false` creates only the owner, with two-step sign-in off. On a localhost `APP_URL` the sign-in page shows this hint. A public `APP_URL` hides it unless `SHOW_DEMO_LOGIN=true`.

## What you can click

- Overview: ads, leads, speed-to-lead, lead quality, landing pages, creative fatigue, and pacing across the marketing system. Super admins and account managers see every client, with spend. Other roles see only their own client, without cost. Voice is a separate section, and only for a client who has the add-on.
- Calls: all calls, appointments, calendar, contacts, do-not-call, CRM tags and availability, voice. Search, filters, a column picker, and 20 rows a page. A row opens the call drawer (transcript, recording, consent, cost, timeline).
- Knowledge: the live sample document, plus drafts you can publish.
- Settings: call eligibility, versioned agent instructions, voice, calling rules, offices, users and two-step sign-in, capability switches, integration health, the activity log, failed jobs, the test console, and the production checklist.

Place a test call from **Settings → Test console**. Preflight runs the same gates as a live dial. If it passes, the worker moves the call through queued → dialing → in progress → wrap-up → completed, writes a transcript, and queues a mocked GoHighLevel note. The call shows on Calls. Choose “Booked” to also create an appointment.

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
| `INTEGRATIONS_MODE` | `mock` (default) or `live`. AIS2L compliance does not change this. |
| `AIS2L_COMPLIANCE_V2` | `off` (default) or `on`. Opt-out, one voicemail, 9 AM–8 PM local hours, opener, and human handoff. Voice stays in mock until `INTEGRATIONS_MODE=live`. |
| `AIS2L_SILENCE_HANGUP_SEC` | Silence hangup while compliance v2 is on. Clamped to 10–15 seconds. Default 12. |
| `AIS2L_CALL_REASON` | Reason said first on a compliance v2 call. Default: you asked for a short introduction. |
| `APP_URL` | Public origin, used in webhook instructions |
| `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET` | GoHighLevel |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID`, `ELEVENLABS_WEBHOOK_SECRET` | ElevenLabs outbound calls |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WEBHOOK_SECRET` | Twilio account check and status callbacks |
| `WORKER_STEP_MS` | Pause between dial states so the live board can show them. `0` skips the pause |
| `SEED_ORG_NAME`, `SEED_ORG_SUBTITLE`, `SEED_AGENT_NAME`, `SEED_TIMEZONE` | Workspace identity applied on the first seed. Defaults: Specificity Inc, AIS2L, Avery, America/New_York |
| `SEED_OFFICES` | `Name\|office\|Timezone;Name\|virtual`. Default: Main office and Virtual, both in `SEED_TIMEZONE` |
| `SEED_BRAND_COLOR`, `SEED_LOGO_URL`, `SEED_MARK` | Mark color (`#2563eb`), optional http(s) logo, and the letter used when no logo is set (`V`) |
| `SEED_KNOWLEDGE_TITLE`, `SEED_KNOWLEDGE_PATH` | Knowledge document. A path replaces the default script. A missing file stops the seed |
| `SEED_OWNER_NAME`, `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` | Owner created on the first seed. Admin and viewer use the same `SEED_ADMIN_*` and `SEED_VIEWER_*` shape, and are created only when `SEED_SAMPLE_DATA` is true |
| `SEED_SAMPLE_DATA` | `true` (default) fills Calls and Overview with sample leads and creates the admin and viewer. `false` leaves an empty dialer and creates only the owner |
| `SHOW_DEMO_LOGIN` | `true` or `false`. Unset shows the demo hint only when `APP_URL` is localhost |
| `PUBLIC_HOMEPAGE` | `on` serves the public jAI page at `/`. Off (default) leaves `/` as the signed-in app |
| `DEMO_WORKSPACE` | `on` shows Try the demo, linking to `/demo` (the enter flow: a signed link or the demo access page). Off hides those buttons. Primary path is `jai.specificityinc.com/demo`. `demo.jai.specificityinc.com` is optional future DNS and rewrites onto `/demo` |
| `HOMEPAGE_DIRECTION` | `B` (default) or `A`. Layout only. Ignored while `PUBLIC_HOMEPAGE` is off |

## Public homepage

`PUBLIC_HOMEPAGE` defaults off. Leave it off and `/` is still the signed-in app. The app home file lives at `/app`. With the switch off, a request for `/` is rewritten to that file and the address bar stays `/`. A signed-in request for `/app` redirects to `/`.

Turn the switch on (`on`, `true`, `1`, or `yes`) and `/` is a public page. Signed-in visitors stay there and get a Go to app link. Nothing redirects them into the app. `/login` is still the only sign-in page. Client login and Team login both go there.

Existing app paths stay where they are. `/marketing`, `/calls`, `/settings`, webhooks, `/api/*`, the Google OAuth callback, and the `voiceops_session` cookie are unchanged. Deep links are not moved under a prefix. `/app` is only the authenticated home that used to be `/`.

After sign-in, with the switch on, a client viewer opens `/marketing/client`. A super admin or account manager opens `/marketing`. Owner, admin, and viewer open `/app`. With the switch off, a client viewer still opens `/marketing/client` and everyone else still opens `/`.

`voiceai.specificityinc.com`, `jarvis.specificityinc.com`, `diverai.specificityinc.com`, and `jai.specificityinc.com` are recognized public hosts. A forged host falls back to `APP_URL` and is not echoed. The session cookie stays host-only (`voiceops_session`). Do not set a cookie Domain, `NEXTAUTH_URL`, or `COOKIE_DOMAIN`. `APP_URL` stays `https://voiceai.specificityinc.com` in production. With `CANONICAL_HOST` unset, a request that arrives on diverai or jai stays on that host.

`CANONICAL_HOST` is unset by default. While it is unset, each allowed host serves as itself and nothing redirects. Set it to one of those hostnames and browser pages on the other hosts redirect there. `/api` and webhooks stay on the host that received them. Email links use `CANONICAL_HOST` when it is set, otherwise `APP_URL`.

`jarvis.specificityinc.com` has no DNS record yet. Caddy still serves only `{$SITE_ADDRESS}`. Production `SITE_ADDRESS` is `voiceai.specificityinc.com` and `APP_URL` is `https://voiceai.specificityinc.com`. Leave those env values as they are, and leave `CANONICAL_HOST` unset, until the DNS record exists. Then set `SITE_ADDRESS` to `jarvis.specificityinc.com, voiceai.specificityinc.com` and point an A record for `jarvis.specificityinc.com` at the same server. Set `CANONICAL_HOST` only after choosing which name is canonical. Do not add the new name to the Caddy site block before that A record exists.

## Google Workspace sign-in

Team login is not connected. The button on the sign-in page says so and does not start OAuth. Do not add Google OAuth credentials to the server for this. When someone approves a Google Workspace OIDC app, it needs:

- OAuth client ID
- OAuth client secret
- Redirect URI `https://jarvis.specificityinc.com/api/auth/oidc/callback`
- Allowed domain `specificityinc.com`

`AUTH_EMAIL_LIVE` (default off) is the only switch that lets sign-in-link and password-reset mail use Resend while `INTEGRATIONS_MODE=mock` keeps voice, SMS, and other sends mocked. `PASSWORD_RESET` and `MAGIC_LINK_ENABLED` also default off. `USER_ADMIN_V2` defaults off.

The homepage contact form writes a `HomepageContact` row and does not send email. Privacy, pricing, and reply time are FAQ answers marked `TODO(jason)` until Jason signs off. They are not claims. Rename `Book a demo` and `Try the demo` in `lib/homepage-cta.ts`. On a phone, including a 390px screen, those logins sit behind the header Menu button (`aria-expanded`). Set `HOMEPAGE_DIRECTION=A` to preview the other layout. Direction B is the default. Section order does not change.

## How the integrations are wired

Adapters live in `lib/adapters`. `getPorts()` returns mocks when `INTEGRATIONS_MODE` is not `live` or the workspace test-mode switch is on.

- **GoHighLevel.** `POST /api/webhooks/ghl` accepts a contact or appointment event. With the schedule on, a new lead becomes a dial job. After a call, a CRM job writes a note and a tag to `https://services.leadconnectorhq.com`. Health checks `GET /locations/{id}`.
- **ElevenLabs.** The worker places the call with `POST /v1/convai/twilio/outbound-call`. `POST /api/webhooks/elevenlabs` stores the transcript, outcome, duration, and cost. In mock mode the adapter returns those immediately.
- **Twilio.** Live mode checks the account. `POST /api/webhooks/twilio` maps `CallStatus` onto the call. ElevenLabs is what actually dials.

Webhook auth: HMAC-SHA256 of the raw body in `x-voiceops-signature`, or the shared secret in `x-webhook-secret`. Mock mode accepts unsigned bodies so the demo runs with empty secrets. Live mode rejects them.

Failed webhook handling and failed CRM writes land in **Settings → Failed jobs**, with retry and discard. Every change is in the activity log. Agent instructions, voice, and calling rules are versioned; publishing is owner-only.

## Marketing data layer

Read-only ad performance for this deployment. The canonical tables are platform-agnostic (accounts, campaigns, ad sets, ads, creatives and versions, audiences, daily metrics, sync runs). Meta and Google Ads payloads are also stored in `MarketingRawRecord`. Google search terms land in `SearchTermMetric` because a search term is not an ad-day row. TikTok and LinkedIn stay reserved on the platform enum.

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
| `META_EXTRA_CONNECTIONS` | Optional comma-separated names for additional Meta businesses. Empty keeps the single primary connection. See below |
| `META_GRAPH_VERSION` | Graph version. Default `v23.0` |
| `META_ATTRIBUTION_WINDOWS` | Comma-separated windows sent to insights. Default `7d_click,1d_view`, stored as `7d_click_1d_view` |
| `MARKETING_SYNC_MODE` | `auto` (default), `mock`, `live`, or `off`. `auto` syncs when the primary token, app id, and app secret are set, or when an extra connection is complete. Otherwise it skips |
| `MARKETING_LOOKBACK_DAYS` | Trailing days re-pulled each run, from 1 to 90. Default 7. Late attribution is handled by upserting this window, not by a high-water mark |
| `MARKETING_SYNC_INTERVAL_MS` | Worker interval. Default 6 hours, or 15 minutes when intraday sync is on and this value is empty. The worker also syncs once on startup |
| `MARKETING_INTRADAY_SYNC` | `off` (default). `on` pulls today and yesterday at ad level between a once-a-day full window. A run is skipped when the previous one is still going |
| `MARKETING_MONITOR` | `off` (default). `on` writes alerts and draft suggestions after a successful sync. Suggestions stay hidden until a second check confirms them |
| `MARKETING_DIGEST` | `off` (default). `on` stores an hourly summary for each account manager. It does not send it |
| `MARKETING_DIGEST_DELIVERY` | `off` (default). Email and SMS are not sent in this version |
| `MARKETING_CLIENT_LINKS` | `off` (default). `on` lets a super admin or account manager create a client share link |
| `MARKETING_SPEED_TO_LEAD` | `off` (default). `on` records how many seconds each new lead waits for a person or Avery. Landing posts must be HMAC-signed per workspace. The target starts at 30 seconds. It does not place calls or change ads |
| `MARKETING_LEAD_SCORING` | `off` (default). `on` labels form leads and call transcripts qualified, not qualified, or spam. Voice stays in test mode. Set it back to `off` to hide tiles, marks, and new scores |
| `LEAD_SCORING_API_KEY` | Optional. Empty keeps the built-in rules. A key calls an OpenAI-compatible model only when the rules are unsure |
| `LEAD_SCORING_API_URL` | Optional chat completions URL. Default is OpenAI |
| `LEAD_SCORING_MODEL` | Optional model name. Default `gpt-4o-mini` |
| `MARKETING_PAGE_MONITOR` | `off` (default). `on` checks landing pages for uptime, speed, forms, and pixels |
| `MARKETING_PAGE_AUTOPAUSE` | `off` (default). `on` can pause ads for a client who opted in on Sites. Each client needs a saved write credential. Google uses `GOOGLE_ADS_CUSTOMER_IDS` and API v26 |
| `MARKETING_SEARCH_WASTE` | `off` (default). `on` finds wasted Google search terms on `SearchTermMetric` and exports a negative-keyword CSV. It does not write to an ad account |
| `MARKETING_COMPETITOR_WATCH` | `off` (default). `on` reads the public Meta Ad Library for up to 5 competitors. It does not read Google's Transparency Center |
| `MARKETING_HOLDOUTS` | `off` (default). `on` stores a holdout design, assignment, and lift readout. It does not change ads or budgets |
| `META_AD_LIBRARY_COUNTRIES` | Countries for Ad Library search. Default `US` |
| `MARKETING_DASHBOARDS_V2` | `off` (default). `on` shows the campaign dashboards (staff overview, drill-down, client view, share links, and onboarding lead value). Spend, budget, and estimated ROAS stay limited to super admins and account managers. The screens only read synced rows |
| `MARKETING_CLIENT_SWITCHER` | `off` (default). `on` adds the staff client dropdown and replaces sample Jarvis home, channel, nav, and audience screens with real `MarketingClient` rows and synced Meta, Google Ads, and StackAdapt metrics. Empty channels say Not connected yet or No data yet. Clients, client viewers, and share links ignore `?client=` and still never see spend |
| `MARKETING_GOOGLE_ADS` | `off` (default). When on, Google Ads sync runs and the dashboards include `google_ads` rows. Meta rows show either way |
| `MARKETING_SUPER_ADMIN_EMAILS` | Comma-separated emails treated as super admins. Unset means nobody. A database role of `super_admin` still counts. |
| `DATABASE_URL` | Postgres URL the CLI writes to. Required for `npm run meta:sync` unless you pass `--dry-run` |

When `META_AD_ACCOUNT_IDS` is set, that list is the only allow-list for the primary connection. When it is empty, the primary sync uses `AdAccount` rows with `syncEnabled` still true, except accounts named on an extra connection. Clearing the env var does not delete history. Set `MARKETING_SYNC_MODE=off` to stop all syncs. Accounts removed from the allow-list stay in the database and are not pulled while the env list is non-empty.

### Second Meta business

The primary variables are one Meta connection (Specificity's system user). A client whose ad account lives in a different Meta Business needs its own app, system user, and `ads_read` token. Do not replace `META_ACCESS_TOKEN`. Do not grant `ads_management`. Do not store the token or app secret in the database. The scheduled sync reads every ready connection, and each account is pulled with the token whose allow-list contains it.

`META_EXTRA_CONNECTIONS` is a comma-separated list of short names (letters, digits, underscores). For a name `befound` the process reads:

| Variable | Use |
| --- | --- |
| `META_BEFOUND_ACCESS_TOKEN` | System user token for that business. `ads_read`, and `read_insights` when granted. Stored only as the pointer `env:META_BEFOUND_ACCESS_TOKEN` when that connection is the one recorded |
| `META_BEFOUND_APP_ID` | App id that issued the token |
| `META_BEFOUND_APP_SECRET` | App secret for `appsecret_proof`. Never written to the database |
| `META_BEFOUND_AD_ACCOUNT_IDS` | Comma-separated allow-list. Required. This connection does not fall back to every stored account |

The first extra connection is `befound`, for Be Found AI's ad account `act_2897217887308756`. A missing token, app id, app secret, or account list skips that name and still syncs the primary connection. An account listed on two connections is read with the earlier one, so the primary wins. Graph version and attribution windows stay the shared `META_GRAPH_VERSION` and `META_ATTRIBUTION_WINDOWS` settings. There is one `PlatformConnection` row per platform, so while the primary credentials are set the stored pointer stays `env:META_ACCESS_TOKEN`.

Set the same variables on the app and the worker, then restart both. Check one connection without writing:

```bash
npm run meta:sync -- --connection befound --account act_2897217887308756 --days 7 --dry-run
```

`--connection primary` is the original token. With `--connection`, accounts are read with that connection, and `--account` overrides that connection's allow-list for the run. With no `--connection`, `--account` uses the connection whose allow-list contains that id. With only the primary connection configured, `--account` still overrides `META_AD_ACCOUNT_IDS` for that run. Omit both flags to read every ready allow-list. `--dry-run` calls Meta and prints counts.

After a successful read, link the account to the existing Be Found AI client (`cmw40hnqi0000n7cvkh5brzm2`). Use that client's current name so the command updates the row instead of creating another client:

```bash
tsx scripts/client-campaign-scope.ts --name "<existing client name>" --accounts act_2897217887308756
```

`act_532471207924121` is still refused as a whole-account link. Campaign ids and the name rule still apply there. Spend visibility is unchanged.

Set the same variables on the app and the worker, then restart the worker. `npm run marketing:sync` runs the Meta sync and the Google Ads sync. Google Ads does nothing unless `MARKETING_GOOGLE_ADS=on`.

### StackAdapt

Read-only GraphQL. `INTEGRATIONS_MODE` stays `mock` and does not gate this connector. A live request needs `STACKADAPT_SYNC=on`, `STACKADAPT_API_KEY`, and `MARKETING_SYNC_MODE=live` or `auto` (the default) once that key is set. `MARKETING_SYNC_MODE=mock` loads fixtures and makes no request. `off` skips. The sync, backfill, and probe request only advertisers mapped on a client with StackAdapt live read on. The client refuses mutations. Clients, client viewers, and share links do not see spend, cost, CPA, CPL, CPx, ROAS, budget, or bid. When `STACKADAPT_SYNC` or `MARKETING_STACKADAPT` is on, the campaign dashboard includes StackAdapt next to Meta and Google Ads.

`tsx scripts/stackadapt-client-scope.ts --name "Client" --advertisers 1001` links a client. `tsx scripts/stackadapt-backfill.ts --days 30` backfills up to 90 days. `tsx scripts/stackadapt-probe.ts --advertiser 1001` prints campaign count, the date range, and impression, click, and conversion totals. It does not print the key.

### Traxy and Apollo prospects

Read-only people for a later campaign audience. These rows are `MarketingProspect`. They are not speed-to-lead form, call, or page leads (`LeadLanding`, `LeadResponse`, `LeadAlert`, `LeadScore`). `INTEGRATIONS_MODE` stays `mock` and does not gate either connector. A live request needs `TRAXY_SYNC=on` or `APOLLO_SYNC=on`, plus `MARKETING_SYNC_MODE=live` or `auto` (the default) once that source's API key is set. `MARKETING_SYNC_MODE=mock` writes a labeled fixture and makes no request. `off` skips. A client is read only when that client's live-read flag is on.

Traxy is `GET https://api.traxy.ai/api/v1`. One key is one workspace. The client never sends `organizationId` or `workspaceId`. Use `leads:read` and `leads:contact_read`. The public list has no saved-view id. A client can be scoped with monitored profile ids, lead tiers (`UNQUALIFIED`, `NURTURE`, `QUALIFIED`, `PRIORITY`), and a minimum ICP match. An unfiltered client is pulled only when it is the only live-read client on that connection.

Apollo uses `https://api.apollo.io/api/v1` and the `x-api-key` header. The sync calls `POST /api/v1/contacts/search`, which Apollo documents as 0 credits, for the label ids saved on the client. `POST /people/match`, reveal flags, sequences, email sends, and contact creates are refused before any network call. Saved-search ids are stored and not queried: the public API has no credit-free saved-search read. An unfiltered Apollo client is pulled only when it is the only live-read client on that connection and no other client holds a saved search there.

`TRAXY_EXTRA_CONNECTIONS=befound` reads `TRAXY_BEFOUND_API_KEY`. `APOLLO_EXTRA_CONNECTIONS=befound` reads `APOLLO_BEFOUND_API_KEY`. An empty connection name on the client uses the primary key. Keys stay in the environment.

Staff open `/marketing/prospects`. Client viewers and share links cannot. The gate matches lead quality: super admins, account managers, staff, the org owner, and all-clients viewers can open it. Contact fields are on that page for those roles. A client or share presentation drops emails, phones, profile URLs, and any spend, budget, or cost field. `MarketingProspect.audienceId` is a nullable hook for a later audience selection. This change does not upload an audience or push to Meta, Google, StackAdapt, or any other ad platform. Webhooks, GoHighLevel, and live keys are not part of this change.

| Variable | Use |
| --- | --- |
| `TRAXY_SYNC` | `off` (default). `on` allows a Traxy read |
| `TRAXY_API_KEY` | Primary workspace key. Bearer token. Never written to the database |
| `TRAXY_EXTRA_CONNECTIONS` | Optional comma-separated names. `befound` reads `TRAXY_BEFOUND_API_KEY` |
| `APOLLO_SYNC` | `off` (default). `on` allows an Apollo read |
| `APOLLO_API_KEY` | Primary Apollo key. Sent as `x-api-key`. Never written to the database |
| `APOLLO_EXTRA_CONNECTIONS` | Optional comma-separated names. `befound` reads `APOLLO_BEFOUND_API_KEY` |

```bash
tsx scripts/prospect-client-scope.ts --name "Cedar Lane Studio" --source traxy --profiles 00000000-0000-4000-8000-000000000001
tsx scripts/prospect-client-scope.ts --name "Cedar Lane Studio" --source apollo --connection befound --lists aaaaaaaaaaaaaaaaaaaaaaaa
tsx scripts/traxy-probe.ts --connection primary
tsx scripts/apollo-probe.ts --connection befound --lists aaaaaaaaaaaaaaaaaaaaaaaa
```

The probes print a count and a date range. They do not print the key or a person's contact details.

### Google Ads

The connector is off unless `MARKETING_GOOGLE_ADS` is `on`. With the switch on and the OAuth client, client secret, refresh token, or login customer id missing, the sync skips and does not raise. A blank `GOOGLE_ADS_DEVELOPER_TOKEN` does not skip the sync. Google retired developer tokens on September 9, 2026. API access follows the Cloud project that owns the OAuth client ([developer token policy](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)). The `developer-token` header is sent only when that variable is set, and the API ignores it. `login-customer-id` is sent when `GOOGLE_ADS_LOGIN_CUSTOMER_ID` is set. `MARKETING_SYNC_MODE=mock` loads labeled fixtures and does not call Google.

Google's OAuth scope (`https://www.googleapis.com/auth/adwords`) can read and write. This connector does not use that write power. `googleAdsRequest` allows only `GoogleAdsService` `search` and `searchStream`. `googleAdsGuard(kind)` in `lib/marketing/connectors/google-ads-client.ts` is the shared allowlist: `read` (this connector), `page-status` (`adGroupAds:mutate` only), and `upload` (`uploadClickConversions` only). A URL on one list is still blocked on the others. Read calls reject every mutate and upload before `fetch`.

`googleAdsEnv()` in `lib/marketing/config.ts` is the only parser. The customer-id variable is `GOOGLE_ADS_CUSTOMER_IDS` (plural). `GOOGLE_ADS_CUSTOMER_ID` is not read. `INTEGRATIONS_MODE` stays `mock` and does not gate this connector. A live request needs `MARKETING_GOOGLE_ADS=on` and `MARKETING_SYNC_MODE=live` or `auto` (the default) once the OAuth client, client secret, refresh token, and login customer id are set. `MARKETING_SYNC_MODE=mock` loads fixtures and makes no request. `off` skips. `GOOGLE_ADS_DEVELOPER_TOKEN` stays optional.

The sync, backfill, and probe read only customer ids saved on a client with Google Ads live read on. When `GOOGLE_ADS_CUSTOMER_IDS` is set, that list is an extra allow-list and the read is the overlap. Nothing is read until a client is scoped. Synced campaigns and their ad account are linked to that client. The API version is `v26` (`GOOGLE_ADS_API_VERSION`). v18 through v22 are sunset and fall back to `v26`. Campaign dates use `start_date_time` and `end_date_time`.

| Variable | Use |
| --- | --- |
| `MARKETING_GOOGLE_ADS` | `off` (default). `on` allows a sync. Turning it off is the rollback: restart the app and the worker, and Google is not called. Rows already stored stay |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Optional. Google retired developer tokens on 2026-09-09. Access follows the Cloud project that owns the OAuth client. Sent as `developer-token` only when set. A blank value does not skip the sync. Never written to the database |
| `GOOGLE_ADS_CLIENT_ID` | OAuth client id |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth client secret. Never written to the database |
| `GOOGLE_ADS_REFRESH_TOKEN` | Refresh token for the Google account that can see the manager account. Stored only as the pointer `env:GOOGLE_ADS_REFRESH_TOKEN` |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | 10-digit manager (MCC) id, with or without dashes. Sent as `login-customer-id` when set |
| `GOOGLE_ADS_CUSTOMER_IDS` | Optional comma-separated 10-digit account ids. Not `GOOGLE_ADS_CUSTOMER_ID`. When set, the sync reads only the overlap with a client's `googleAdsCustomerIds`. When empty, every client with live read on is still the only source |
| `GOOGLE_ADS_API_VERSION` | Default `v26`. Sunset majors v18–v22 are ignored and replaced with `v26` |

```bash
MARKETING_GOOGLE_ADS=on MARKETING_SYNC_MODE=mock npm run google-ads:sync
```

A live pull uses the same command with `MARKETING_SYNC_MODE=live` and the credentials above, after a client is scoped. It reads campaigns, ad groups, ads, daily ad metrics, and search terms. It does not change the Google Ads account.

```bash
tsx scripts/google-ads-client-scope.ts --name "Client" --customers 1234567890
tsx scripts/google-ads-backfill.ts --days 30
tsx scripts/google-ads-probe.ts --customer 1234567890
```

`--name` is a client name or an existing client id. `--customers` is a comma-separated list of 10-digit ids, with or without dashes; they are stored without dashes. `--off` keeps the ids and turns live read off. `--days` is 1–90. The probe prints campaign count plus impression, click, and cost totals and writes nothing. Spend stays hidden on client dashboards, client viewers, share links, and exports.

To roll back without a deploy, set `MARKETING_GOOGLE_ADS=off` (or remove it) on the app and the worker and restart both. To roll back the code, revert this change. There is no mutate call to undo in Google Ads.

To validate a real token outside this environment, run the read-only Meta CLI. It calls Graph with `appsecret_proof`, prints pulled row counts and any API errors as JSON, and writes the database unless `--dry-run` is set:

```bash
META_ACCESS_TOKEN=... META_APP_ID=1093413013101625 META_APP_SECRET=... \
  DATABASE_URL=postgresql://... \
  npm run meta:sync -- --account act_532471207924121 --days 30 --dry-run
```

`--account` accepts one id or a comma-separated list, and can be repeated. `--connection` limits the run to `primary` or one name from `META_EXTRA_CONNECTIONS`. `--days` is the inclusive trailing window (1–90, default 7). The date window is computed in `America/New_York`. Omit `--dry-run` to upsert into `DATABASE_URL` and print a row count for each marketing table.

Insights run first, at ad level. Campaigns, ad sets, and ads are then loaded one edge at a time (not in parallel). Each list is filtered to rows updated since the window start and not archived or deleted. Delivered ids are loaded from the same account edge with `filtering` `IN` on `campaign.id`, `adset.id`, or `ad.id`, 50 ids at a time. The `ids` query parameter is not used. Ad rows ask only for `creative{id}`. Full creative fields, including `object_story_spec`, are a second pass on `/{account}/ads` filtered by `ad.id` IN, limit 25, and only for ads that delivered. Filtering `adcreative.id` is not supported. Ads that did not deliver stay on `creative{id}`.

If an edge fails, insights and any entities already loaded are still saved, and the report names the skipped edge. A skipped edge does not delete or replace rows already stored for parents that did not load. Delivered ids with no payload are placeholders: they are inserted only when that id is new, so a later metric can attach. An existing campaign, ad set, or ad is left as-is, including its audience links and raw payload. Audience links are replaced only for ad sets whose payload included `targeting`.

Graph list calls follow cursor pagination (100 rows per page, 200 pages max). A response that says to reduce the amount of data, or any 5xx, retries that page at half the limit (minimum 10). HTTP 429 and error codes 4, 17, 32, 613, and 80004 retry with `Retry-After` or exponential backoff. Code 17 with neither `Retry-After` nor `estimated_time_to_regain_access` waits 30 seconds, doubling up to 120 seconds. A short 1–8 second backoff was still inside the user-request limit, so the ad set edge was skipped after five tries. `estimated_time_to_regain_access` is waited out when it is greater than zero. High `total_cputime` / `call_count` with a zero regain time is a 5 second gap, not a minute per page, except for that code 17 backoff. Each page logs one stderr line: method, path with no query string, page number, rows so far, and the sleep reason and duration. The token and `appsecret_proof` are not logged. An account pull stops after 12 minutes instead of sleeping past that limit. A code 17 wait that would pass the cap stops the pull with a rate-limit error instead of treating the edge as empty.

An insights window longer than 7 days, or a short window that still times out at the minimum page size, is submitted as an async insights job. Polls back off from 5 seconds to 30 seconds.

Development access (`ads_api_access_tier: development_access`) keeps CPU usage near 100% from the first call, so a full ad archive will not finish. This pull stays on the delivering and recently updated set. Standard Access is required before syncing several accounts on the worker interval. A 30-day pull of one account stays small when the delivering set fits in one batch and insights return in a page or two: the account, one insights job, a few polls, the insight result pages, one filtered id batch each for campaigns, ad sets, and ads, one updated-since list page per edge, one ads call per 25 delivered ads for creative fields, and one audience list. Add a call per extra 50 ids and per extra insight page.

Daily rows are unique on workspace, date, platform, ad, audience segment, and attribution window. Running the sync again updates those rows in place. Reach is stored and shown per row; the screen does not add it up. Budgets are converted from Meta minor units into the account currency. Overlapping lead action types use the max value so the same leads are not counted twice. Creative versions are a SHA-256 of headline, body, description, CTA, media id, and landing path (query strings are ignored). The first time a fingerprint is seen it gets the next `vN` label for that concept and keeps it.

### Google Analytics 4

The connector is off unless `GOOGLE_ANALYTICS_SYNC` is `on`. It stays off, and writes nothing, until that flag is on and a refresh token is present. It does not read `GOOGLE_ADS_REFRESH_TOKEN` and it does not request the adwords scope. The token refresh uses the existing web OAuth client (`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`) and `https://www.googleapis.com/auth/analytics.readonly`.

The only Analytics call is `POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`. Sessions, engaged sessions, and key events are stored by day with session campaign, source, medium, and landing page. Those rows join to a jAI campaign when the session campaign id or name matches one campaign for that client. The dashboard shows the traffic next to campaign performance. Clients, client viewers, and share links can see the traffic. Spend, ROAS, and cost stay off those surfaces.

`GOOGLE_ANALYTICS_REFRESH_TOKEN` is the primary connection (ads@specificityinc.com). An empty `googleAnalyticsConnectionName` on a client uses it. `GOOGLE_ANALYTICS_EXTRA_CONNECTIONS` lists more logins, the same way Meta and Traxy list extras. A name `angelo` reads `GOOGLE_ANALYTICS_ANGELO_REFRESH_TOKEN`. Angelo Marketing and Capital Financial USA are expected later and are not mapped in this change. A client pointed at a name that has no token is skipped and logged. A client with no property id is skipped. The demo workspace does not call Google.

New decision types run only when `DECISIONS_V1` is on, `GOOGLE_ANALYTICS_SYNC` is on, a refresh token env is set, and the client has a mapped property with enough stored rows: spend with little or no matching site traffic, site traffic with no conversions, and a sudden landing-page drop. They recommend only. They do not change a budget or write to Google Analytics. The spend decision is hidden from anyone who cannot see spend.

The locked ads@ property list lives in `lib/marketing/google-analytics/locked-mappings.ts` for the helper and tests. It is not applied on migrate.

| Variable | Use |
| --- | --- |
| `GOOGLE_ANALYTICS_SYNC` | `off` (default). `on` allows a read. Turning it off is the rollback |
| `GOOGLE_OAUTH_CLIENT_ID` | Web OAuth client id used only to refresh the Analytics token |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Web OAuth client secret. Never written to the database |
| `GOOGLE_ANALYTICS_REFRESH_TOKEN` | Primary Analytics refresh token. Not the Google Ads token |
| `GOOGLE_ANALYTICS_EXTRA_CONNECTIONS` | Optional comma-separated names. Empty keeps the primary connection only |
| `GOOGLE_ANALYTICS_<NAME>_REFRESH_TOKEN` | Refresh token for one extra name. Example: `GOOGLE_ANALYTICS_ANGELO_REFRESH_TOKEN` |

```bash
tsx scripts/google-analytics-client-scope.ts --name "Be Found AI" --property 553292453
tsx scripts/google-analytics-client-scope.ts --print-locked
tsx scripts/google-analytics-client-scope.ts --apply-locked
GOOGLE_ANALYTICS_SYNC=on MARKETING_SYNC_MODE=live npm run google-analytics:sync
```

`--apply-locked` prints the locked ads@ mappings and does not write unless `--write` is also set. It updates an existing client and leaves every other field alone. Do not point it at production until the property list has been reviewed. `--connection angelo` stores that name for a later extra token.

### Add a source

1. The `AdPlatform` enum already includes `google_ads`, `tiktok`, and `linkedin`. Add a new value only if the source is not in that list, and ship a migration with it.
2. Map the source's payloads into `NormalizedSnapshot` in a new file under `lib/marketing/connectors/`. Keep source-specific JSON in `MarketingRawRecord`.
3. Implement `AdPlatformConnector` and register it in `lib/marketing/connectors/registry.ts`. `applySnapshot` upserts the canonical tables; the new source should not need its own tables.
4. Read credentials from env vars at call time. If they are missing, skip. Do not hardcode an account id.
5. Add mapping tests and an idempotent sync test. Re-running the same snapshot must not insert duplicate daily rows.

### Deferred

Lead, call, and booking joins stay out of this module so dialing and consent are unchanged. Also deferred: targeting history (current include and exclude links are stored), a date dimension, campaign-name parsing, age/gender/placement breakdowns, currency conversion, an OAuth connect button, and the TikTok and LinkedIn connectors. Google Ads search and searchStream are connected behind `MARKETING_GOOGLE_ADS`.

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
