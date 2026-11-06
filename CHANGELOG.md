# Changelog

## Unreleased

- Google Analytics 4 is a read-only connector, off until `GOOGLE_ANALYTICS_SYNC` is on. It refreshes `GOOGLE_ANALYTICS_REFRESH_TOKEN` with `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` and calls only `analyticsdata.googleapis.com` `runReport` for `analytics.readonly`. It does not read or replace `GOOGLE_ADS_REFRESH_TOKEN`. Extra logins use `GOOGLE_ANALYTICS_EXTRA_CONNECTIONS` and `GOOGLE_ANALYTICS_<NAME>_REFRESH_TOKEN`. Angelo Marketing and Capital Financial USA are not mapped yet. Mapped clients store a connection name and a GA4 property id. Daily sessions, engaged sessions, and key events land on `GoogleAnalyticsDaily` and the dashboard. Decisions can flag spend with little site traffic, traffic with no conversions, and a landing-page drop. Spend copy stays staff-only. `scripts/google-analytics-client-scope.ts` sets only the Analytics fields.
- Meta sync can read more than one business. `META_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, and `META_AD_ACCOUNT_IDS` stay the primary connection. `META_EXTRA_CONNECTIONS` lists extra names, and each name uses `META_<NAME>_ACCESS_TOKEN`, `META_<NAME>_APP_ID`, `META_<NAME>_APP_SECRET`, and `META_<NAME>_AD_ACCOUNT_IDS`. A missing extra is skipped. Tokens stay in the environment. The first extra connection is Be Found AI (`act_2897217887308756`). Spend visibility and the shared-account link block are unchanged.
- Google Ads live reads are per client and stay read-only. `MarketingClient.googleAdsCustomerIds` and `googleAdsLiveRead` (default off) choose the accounts. `GOOGLE_ADS_CUSTOMER_IDS`, when set, is an extra allow-list. Campaign queries use v26 `start_date_time` and `end_date_time`. Spend stays hidden from clients.
- The user-facing product name is JAI by Specificity. Flags, route paths, file names, cookies, and the existing public hosts are unchanged.
- `jai.specificityinc.com` is a public host alongside voiceai, jarvis, and diverai. With `CANONICAL_HOST` unset, all four serve and nothing redirects. `APP_URL` is unchanged.
- Flags, route paths, file names, cookies, and the `jarvis.specificityinc.com` host stay as they are.
- `diverai.specificityinc.com` is a public host alongside `voiceai.specificityinc.com` and `jarvis.specificityinc.com`. With `CANONICAL_HOST` unset, all three serve and nothing redirects. Sign-in, logout, magic-link redeem, company sign-in, contact, and demo redirects stay on the host that received the request. `APP_URL` is unchanged.
- Sign-in is host-agnostic. With `CANONICAL_HOST` unset, the public hosts serve and nothing redirects. Set `CANONICAL_HOST` to one of those hostnames and browser pages on the other hosts redirect there. API and webhooks stay on the host that received them. The session cookie stays host-only.
- Super admins see the same teammate invite form as owners, limited to owner, admin, and viewer.
- Password reset (`PASSWORD_RESET`, default off) stores a hashed single-use token for 30 minutes, rate limits requests, invalidates sessions, and does not reveal whether the email exists. While the switch is off, the support address stays the only path.
- `AUTH_EMAIL_LIVE` (default off) is the only path that sends sign-in and reset mail through Resend while integrations stay mocked. Otherwise those messages are a MailLog row with transport `would send`.
- Team login does not start Google OAuth. The screen says company sign-in is not connected.
- The account menu has Sign out, and Team & security and Roles for the roles that can open them.
- `USER_ADMIN_V2` (default off) assigns account managers, creates a client viewer for one client, and turns accounts off (sessions revoked). Hard delete is super-admin only and requires the email. Account managers cannot create super admins.
- Client owners, client viewers, and share links also lose CPA and bid. `ALL_CLIENTS_VIEWER_SEES_COST` stays off.
- An unset `MARKETING_SUPER_ADMIN_EMAILS` no longer treats the placeholder addresses as super admins.

### VoiceOps UX for paying customers

Plain-language copy, empty states, and Specificity branding on the voice and settings screens. Call logic, consent gates, test mode, and integration checks are unchanged.

- Product name in the app is VoiceOps. Avery is described as your AI caller. Placeholder brand tokens live in `lib/brand.ts`: Poppins and `#FF5800`, with the Specificity logo when a workspace has not set its own.
- A test/live status pill sits in the header. Test mode explains that no real calls are placed. Turning it off is a typed "GO LIVE" confirmation on the go-live checklist, and only after the other checklist steps pass.
- Settings use customer labels (go-live checklist, Avery's script, Avery's voice, locations, connections). Integration cards say Not connected, Test only, Connected, Problem, or Unknown instead of a blanket Healthy.
- Empty tables explain what will show up and offer one next step. Do-not-call add and import fields have labels. Publishing a voice, a script, calling rules, or pausing a location asks for confirmation.
- Help replaces the developer docs page. Privacy, terms, support, and a password-reset request page are public. The reset page does not send email; it tells the customer to contact Specificity.
- Turning test mode off is refused by the server unless every other go-live step is done and the request includes the words GO LIVE.
- The header and sidebar use the Specificity wordmark from `lib/brand.ts`, with the tagline Identify. Engage. Convert. on sign-in and in the footer.
- Dismissing the test-mode note is stored in a cookie so it stays dismissed after a reload.
- Demo sign-in hints are hidden in production builds, and the default seed passwords are no longer the ones shown in earlier screenshots.
- Go-live counts exclude the test-mode step itself, so done plus remaining always equals the total, and Go live stays off until remaining is zero.
- Viewers do not see write actions, and the server rejects those actions. CRM keys are read-only unless the role is a Specificity super admin. Env-var details are hidden from owners.
- Teammates are invited by email (or a copyable link when email is not configured) instead of a typed temporary password.
- Primary buttons use dark text on #FF5800. The brand default is that orange and the Specificity mark, not blue or "V".
- The voice log no longer links to ElevenLabs. Help no longer claims a national do-not-call check. Request access has its own form.

### Speed-to-lead

- Behind `MARKETING_SPEED_TO_LEAD`, which defaults to off. While it is off, leads, calls, digests, client pages, and share links behave as they did before.
- The clock starts at the page landing time (a landing event or a hidden form field). If that time is missing, it uses GoHighLevel's submit time (`dateAdded` or `submittedAt`) or the call start and says so, for example "from form submit". If GHL did not send a submit time, the clock uses webhook arrival and the lead is labeled "from webhook arrival".
- `POST /api/webhooks/landing` requires an HMAC for this workspace (`x-voiceops-signature` over `workspaceId.body`). Unsigned requests are rejected. The flag still defaults to off, and while it is off the route answers 404.
- Each client has a response target. The default is 30 seconds. A worker sweep flags a lead that is still unanswered at the target, then again at 15 minutes, and resolves the alert when someone or Avery makes contact. The staff marketing page shows the median, the percent answered inside the target, and the slowest leads.
- Migration `20261029224000_speed_to_lead` only adds tables and a recommendation type. It does not reuse `20261029210000`, `20261029220000`, `20261029223000`, or `20261029230000`. It does not change budgets, ads, or voice test mode.
- Google Ads settings stay in the connector from main: `googleAdsApiVersion` defaults to v26, customer ids come only from `GOOGLE_ADS_CUSTOMER_IDS`, and requests go through `googleAdsGuard`. This feature does not add a second copy.

### Marketing search waste, competitor watch, and holdouts

Three read-only marketing tools, each behind its own flag. All three default **off**. None of them write to an ad account.

- `MARKETING_SEARCH_WASTE` reads `SearchTermMetric` (the Google Ads search-term table) and downloads a negative-keyword CSV for a person to apply. An imported report is written into that same table. Customer ids come from `GOOGLE_ADS_CUSTOMER_IDS` via `googleAdsEnv`. There is no second search-term table and no second Google Ads client.
- `MARKETING_COMPETITOR_WATCH` reads the public Meta Ad Library only (up to 5 competitors) and can save a draft creative idea. It does not store spend or results.
- `MARKETING_HOLDOUTS` stores a test design, a stable holdout assignment, and a lift readout with a 90% range. A super admin starts a test. Cost per extra lead is returned only to super admins and account managers.
- Migration `20261030170000_marketing_search_competitors_holdouts` sorts after `20261030162000_landing_page_monitor`. Every query for these tables includes `workspaceId`.

### Marketing operations

- Human campaign budgets (amount, daily or lifetime, currency, who set it, when) with an audit row for each change. Only a signed-in super admin, or an account manager for that campaign, can save one. Sync, the monitor, and worker jobs do not write it. Accepting a budget suggestion records the decision and does not write the budget or call an ad platform.
- Spend, budgets, CPC, CPM, CPA, and any other cost-derived field are returned only to super admins and account managers. Owners, admins, viewers, client viewers, and share links receive a server payload with those fields, budget cards, and cost rules removed. CSV exports follow the same rule.
- A share link with a passcode does not return JSON or CSV until the passcode cookie is present. Viewer write actions answer 403. Share pages send `Referrer-Policy: no-referrer`.
- Marketing migrations run after `20261029193000_invites_and_brand_defaults`: `20261029200000_marketing_ops`, then `20261029210000_share_passcode`.
- Roles: super admin (a database role, or emails listed in `MARKETING_SUPER_ADMIN_EMAILS`; an unset list grants nobody), account manager scoped to the client, an ad account, or a campaign, and a read-only client viewer for exactly one client.
- Client viewers and share links get an allowlisted performance payload (impressions, reach, clicks, click rate, conversions, leads, frequency, creative previews, trends). Cost fields are removed on the server. Each view is audited.
- Specificity theme tokens live in `lib/brand/tokens.ts` and CSS variables. Placeholder colors and Inter until the designer's tokens replace that file. Tagline: Identify. Engage. Convert.

Flags default **off**:

- `MARKETING_INTRADAY_SYNC` — 15 minute cadence, today and yesterday at ad level, full trailing window once a day. Skips when a previous sync is still running.
- `MARKETING_MONITOR` — alerts and suggestions after a sync. A suggestion is hidden until a second check confirms it.
- `MARKETING_DIGEST` — hourly stored summary for each account manager.
- `MARKETING_DIGEST_DELIVERY` — no email or SMS is sent.
- `MARKETING_CLIENT_LINKS` — tokenized share links.
- `MARKETING_LEAD_SCORING` — form and call labels, staff and owner marks, and a staff-only cost-per-qualified-lead tile. Off leaves the current screens and payloads alone. No model key means rules only. Voice test mode is unchanged.

### Lead quality scoring

- Rules label each form lead and each completed call as qualified, not qualified, or spam. A model runs only when `LEAD_SCORING_API_KEY` is set and the rules are unsure. A failed model call keeps the rule result.
- The owner can mark Qualified or Not qualified. Super admins and account managers can mark and override, including spam and clearing a mark. Admins, viewers, client viewers, and share links cannot mark. The mark route checks the role before it writes.
- A manual mark is stored beside the automatic score and is the one that counts. The screen shows who marked it and when, and the activity log records the same.
- Cost per qualified lead is queried and returned only when `seesCost` is true (super admin and account manager). Owners, client viewers, and share links get counts and a week-over-week trend, with the cost field removed on the server.
- `npm run lead-score:eval` scores `fixtures/lead-quality/labeled.csv` and prints accuracy. Roll back by setting `MARKETING_LEAD_SCORING=off`. The `LeadScore` table can stay; nothing reads it while the flag is off.
- Marks and qualified counts are limited to the caller's workspace. A super admin may mark any workspace. The model prompt does not include name, phone, or email. The owner role is the client owner (`client_owner`); admin and viewer cannot mark.

### Decision UI (spec 2026-10-29)

- Decision cards, including a recommend-only budget card. Approving records the OK and the steps. It does not change the budget or call an ad platform. “I made the change” only marks the handoff done.
- Hourly summary layout for an account manager. Email stays off.
- Super-admin client comparison and a skill yes/no prompt. A skill cannot be granted a budget change.
- Client share view shows booked calls, leads, ad views, and campaign status. No cost or currency.
- Brand tokens use the placeholder orange `#FF5800` and Poppins. `lib/brand.ts` points `brandColor` and `logoUrl` at `specificity-mark.png`.

### Follow-ups

- PDF download on the client share view.
- Turn the flags on only after the owner approves the deploy checklist.
- Email and SMS delivery for digests.
- Designer replaces the placeholder brand tokens.
- UX specs for alerts, suggestions, digests, and the client view.
- A screen to invite a client viewer (the API exists; the form does not).
- A signed-in client viewer can open client results and their landing-page status. Invites stay behind `MARKETING_CLIENT_VIEWERS` and need a strong password.

### Landing page monitoring

- `MARKETING_PAGE_MONITOR` (default off) checks each watched page for uptime, speed, a broken form, and a missing Meta Pixel, Google tag, or Tag Manager. A single failed check does not alert. Down alerts wait for two checks about a minute apart, and a canary URL must answer before a failure can pause ads. Alerts are deduped, muted for 24 hours, and held in quiet hours unless they are critical.
- `MARKETING_PAGE_AUTOPAUSE` (default off) pauses ads only after that marketing client opts in. The workspace id `org` is not a client. The ad must belong to that client, be live, and point at the down page. Google status changes use `googleAdsGuard("page-status")` (`adGroupAds:mutate` only) on API v26, and only for an id in `GOOGLE_ADS_CUSTOMER_IDS`. Pause rows and the audit stay if the page or ad is deleted, so resume still works.
- With no separate write token, the worker logs the pause it would send and does not call Meta or Google. The read token (`META_ACCESS_TOKEN`) is not a write credential. Clients see “Ads paused while your page was down” and no cost fields.
