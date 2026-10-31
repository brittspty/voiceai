import Link from "next/link";
import { formatDateTime } from "@/lib/format";

type Item = { id?: string; title?: string; summary?: string; accountId?: string };

type Decision = { id?: string; title?: string; prompt?: string; reason?: string };

function items(payload: unknown, key: "alerts" | "recommendations") {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as Item[]) : [];
}

function decisions(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as { decisions?: unknown }).decisions;
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Decision => Boolean(row) && typeof row === "object");
}

function deliveryLine(delivery: string) {
  if (delivery === "sent") return "stored in the app · emailed";
  if (delivery === "logged") return "stored in the app · written to the mail log";
  if (delivery === "queued") return "stored in the app · waiting to send";
  return "stored in the app · not emailed";
}

export function HourlySummary({
  enabled,
  emailOn = false,
  digests,
}: {
  enabled: boolean;
  emailOn?: boolean;
  digests: { id: string; createdAt: string; delivery: string; payload: unknown }[];
}) {
  const latest = digests[0];
  const alerts = latest ? items(latest.payload, "alerts").slice(0, 3) : [];
  const recommendations = latest ? items(latest.payload, "recommendations") : [];
  const pending = latest ? decisions(latest.payload) : [];
  const quiet = latest && alerts.length === 0 && recommendations.length === 0 && pending.length === 0;
  return (
    <section>
      <h2 className="mb-1 font-semibold">Your hourly summary</h2>
      {!enabled && <p className="text-sm text-muted">Hourly updates are turned off.</p>}
      {enabled && !latest && <p className="text-sm text-muted">{emailOn ? "No stored summary yet. The next one is saved on the hour and emailed." : "No stored summary yet. The next one is saved on the hour. Email is off."}</p>}
      {enabled && latest && (
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="text-sm text-muted">{formatDateTime(latest.createdAt)} · {deliveryLine(latest.delivery)}</p>
          {quiet && <p className="mt-3">All quiet this hour. No decisions are waiting. No email is sent when nothing changed.</p>}
          {alerts.map((alert) => (
            <p key={alert.id || alert.title} className="mt-3">
              <b>Urgent: </b>
              {alert.title}. {alert.summary}{" "}
              <Link className="text-brand-ink" href="#queue">Decide now</Link>
            </p>
          ))}
          {pending.map((row) => (
            <p key={row.id || row.title} className="mt-3">
              <b>{row.prompt === "pause" ? "Pause? " : "Rotate? "}</b>
              {row.title}. {row.reason}{" "}
              <Link className="text-brand-ink" href="#queue">Yes or no</Link>
            </p>
          ))}
          {recommendations.length > 0 && (
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 font-medium">Change</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((row) => (
                  <tr key={row.id || row.title} className="border-b border-line">
                    <td className="py-2">{row.title}{row.title?.toLowerCase().includes("budget") ? " · You set this" : ""}</td>
                    <td className="py-2"><Link className="text-brand-ink" href="#queue">Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-sm text-muted">
            {latest.delivery === "sent" && "Emailed to you."}
            {latest.delivery === "logged" && "Test mode wrote this email to the mail log. Nobody was emailed."}
            {latest.delivery === "queued" && "This summary is waiting to send."}
            {latest.delivery !== "sent" && latest.delivery !== "logged" && latest.delivery !== "queued" && "Email delivery is off. Nothing is sent."}
          </p>
        </div>
      )}
    </section>
  );
}
