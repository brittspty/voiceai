# Changelog

## Unreleased

### VoiceOps UX for paying customers

Plain-language copy, empty states, and Specificity branding on the voice and settings screens. Call logic, consent gates, test mode, and integration checks are unchanged.

- Product name in the app is VoiceOps. Avery is described as your AI caller. Placeholder brand tokens live in `lib/brand.ts`: Poppins and `#FF5800`, with the Specificity logo when a workspace has not set its own.
- A test/live status pill sits in the header. Test mode explains that no real calls are placed. Turning it off is a typed "GO LIVE" confirmation on the go-live checklist, and only after the other checklist steps pass.
- Settings use customer labels (go-live checklist, Avery's script, Avery's voice, locations, connections). Integration cards say Not connected, Test only, Connected, Problem, or Unknown instead of a blanket Healthy.
- Empty tables explain what will show up and offer one next step. Do-not-call add and import fields have labels. Publishing a voice, a script, calling rules, or pausing a location asks for confirmation.
- Help replaces the developer docs page. Privacy, terms, support, and a password-reset request page are public. The reset page does not send email; it tells the customer to contact Specificity.
