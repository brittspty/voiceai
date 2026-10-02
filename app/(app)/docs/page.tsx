import { PageTitle } from "@/components/shell";
import { appUrl } from "@/lib/env";
import { getOrg } from "@/lib/queries";

export default async function DocsPage() {
  const [base, org] = [appUrl(), await getOrg()];
  return (
    <div className="max-w-3xl">
      <PageTitle title="Docs" subtitle={`How this Voice Operations workspace is wired for ${org.name}. Each client runs on its own server.`} />
      <div className="space-y-4 text-sm leading-6">
        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-medium">What it does</h2>
          <p className="mt-1 text-muted">An outbound voice agent calls leads from GoHighLevel, speaks through ElevenLabs over a Twilio number, and books meetings back onto the office calendar. Every dial passes consent, do-not-call, local calling hours, a daily cap, and a retry limit.</p>
        </section>
        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-medium">Webhooks</h2>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>{base}/api/webhooks/ghl</li>
            <li>{base}/api/webhooks/elevenlabs</li>
            <li>{base}/api/webhooks/twilio</li>
          </ul>
          <p className="mt-2 text-muted">Sign the raw body with HMAC-SHA256 and send it as <span className="font-mono">x-voiceops-signature</span>, or send the shared secret as <span className="font-mono">x-webhook-secret</span>. In mock mode, unsigned requests are accepted.</p>
        </section>
        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-medium">Test and live</h2>
          <p className="mt-1 text-muted">Test mode is on by default. The Test console runs the same pipeline against mock adapters. Set INTEGRATIONS_MODE=live and turn test mode off only when the production checklist is green. See DEPLOY-AWS.md for the single-server pilot.</p>
        </section>
      </div>
    </div>
  );
}
