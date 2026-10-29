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
