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

### Marketing operations

- Human campaign budgets (amount, daily or lifetime, currency, who set it, when) with an audit row for each change. Only a signed-in super admin, or an account manager for that campaign, can save one. Sync, the monitor, and worker jobs do not write it. Accepting a budget suggestion updates the local field and does not call an ad platform.
- Roles: super admin (Jason, Brittany, and Chris are seeded placeholders; emails come from `MARKETING_SUPER_ADMIN_EMAILS`), account manager scoped to the client, an ad account, or a campaign, and a read-only client viewer for exactly one client.
- Client viewers and share links get an allowlisted performance payload (impressions, reach, clicks, click rate, conversions, leads, frequency, creative previews, trends). Cost fields are removed on the server. Each view is audited.
- Specificity theme tokens live in `lib/brand/tokens.ts` and CSS variables. Placeholder colors and Inter until the designer's tokens replace that file. Tagline: Identify. Engage. Convert.

Flags default **off**:

- `MARKETING_INTRADAY_SYNC` — 15 minute cadence, today and yesterday at ad level, full trailing window once a day. Skips when a previous sync is still running.
- `MARKETING_MONITOR` — alerts and suggestions after a sync. A suggestion is hidden until a second check confirms it.
- `MARKETING_DIGEST` — hourly stored summary for each account manager.
- `MARKETING_DIGEST_DELIVERY` — no email or SMS is sent.
- `MARKETING_CLIENT_LINKS` — tokenized share links.

### Follow-ups

- Turn the flags on only after the owner approves the deploy checklist.
- Email and SMS delivery for digests.
- Designer replaces the placeholder brand tokens.
- UX specs for alerts, suggestions, digests, and the client view.
- A screen to invite a client viewer (the API exists; the form does not).
- Keep a client viewer who signs in with email out of Calls and Settings.
