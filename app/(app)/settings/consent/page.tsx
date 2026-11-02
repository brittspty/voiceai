import { redirect } from "next/navigation";
import { ConsentDraftPreview } from "@/components/consent-draft-preview";
import { ConsentOnboardingPanel } from "@/components/consent-onboarding-panel";
import { requireUser } from "@/lib/auth";
import { saveVoiceConsentMinimum } from "@/lib/consent/actions";
import { consentPopupEnabled, voiceConsentGateEnabled } from "@/lib/consent/flags";
import { consentSnippet } from "@/lib/consent/script";
import { loadConsentOnboarding, readVoiceConsentSetting } from "@/lib/consent/store";
import { appUrl } from "@/lib/env";
import { WORKSPACE_ID } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Consent pop-up" };

export default async function ConsentSettingsPage() {
  const user = await requireUser();
  if (user.role === "client_viewer") redirect("/marketing/client");
  if (user.role === "all_clients_viewer" || user.role === "demo_viewer") redirect("/");
  const popupOn = consentPopupEnabled();
  const gateOn = voiceConsentGateEnabled();
  const canSave = user.role === "owner" || user.role === "admin" || user.role === "super_admin" || user.role === "account_manager";
  const minimum = await readVoiceConsentSetting(WORKSPACE_ID).catch(() => "default" as const);
  const selection = popupOn ? await loadConsentOnboarding(WORKSPACE_ID).catch(() => null) : null;
  const snippet = consentSnippet(appUrl(), WORKSPACE_ID);

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight">Consent pop-up</h1>
        <p className="mt-1 text-sm text-muted">Diver AI consent for client websites. The wording is a draft until legal review.</p>
      </div>
      <ConsentDraftPreview />
      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <p>CONSENT_POPUP is {popupOn ? "on" : "off"}. {popupOn ? "Client websites can load the widget." : "Client websites do not load the widget."}</p>
        <p className="mt-2">VOICE_CONSENT_GATE is {gateOn ? "on" : "off"}. {gateOn ? "Voice fails closed without a matching record." : "Voice is not held by this gate."}</p>
        <p className="mt-2">Jason chose medium on Nov 2, 2026. Medium or high unlocks voice. Low, a rejection, or no record does not.</p>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-base font-semibold">Snippet</h2>
        <p className="mt-1 text-sm text-muted">Paste this as the first thing in the head of each client website, before other tags. Do not add async or defer.</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-canvas p-3 text-xs">{snippet}</pre>
      </section>
      {selection ? <ConsentOnboardingPanel selection={selection} /> : null}
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-base font-semibold">Voice minimum</h2>
        <p className="mt-1 text-sm text-muted">Per client. Jason chose medium on Nov 2, 2026. Leave this on the global default unless a client needs a different level.</p>
        <form action={saveVoiceConsentMinimum} className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium" htmlFor="voice-consent-level">Level</label>
          <select id="voice-consent-level" name="level" defaultValue={minimum} disabled={!canSave} className="min-h-11 rounded-lg border border-line bg-card px-2">
            <option value="default">Use the global default (medium)</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {canSave ? <button className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 font-semibold text-on-ink" type="submit">Save</button> : null}
        </form>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="text-base font-semibold">Decisions</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Jason chose medium on Nov 2, 2026. Medium or high unlocks voice. Low or no record does not.</li>
          <li>Consent records are kept indefinitely. There is no retention date and no purge job. The log stays append-only.</li>
          <li>A choice ties to a contact when any form email or phone, hashed email or phone, click id, or CRM id matches.</li>
          <li>The wording is still DRAFT pending legal review.</li>
        </ul>
      </section>
    </div>
  );
}
