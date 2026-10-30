# Changelog

## Unreleased

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

### Marketing operations

- Human campaign budgets (amount, daily or lifetime, currency, who set it, when) with an audit row for each change. Only a signed-in super admin, or an account manager for that campaign, can save one. Sync, the monitor, and worker jobs do not write it. Accepting a budget suggestion records the decision and does not write the budget or call an ad platform.
- Spend, budgets, CPC, CPM, CPA, and any other cost-derived field are returned only to super admins and account managers. Owners, admins, viewers, client viewers, and share links receive a server payload with those fields, budget cards, and cost rules removed. CSV exports follow the same rule.
- A share link with a passcode does not return JSON or CSV until the passcode cookie is present. Viewer write actions answer 403. Share pages send `Referrer-Policy: no-referrer`.
- Marketing migrations run after `20261029193000_invites_and_brand_defaults`: `20261029200000_marketing_ops`, then `20261029210000_share_passcode`.
- Roles: super admin (Jason, Brittany, and Chris are seeded placeholders; emails come from `MARKETING_SUPER_ADMIN_EMAILS`), account manager scoped to the client, an ad account, or a campaign, and a read-only client viewer for exactly one client.
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
- A signed-in client viewer is limited to the client results page. Invites stay behind `MARKETING_CLIENT_VIEWERS` and need a strong password.
