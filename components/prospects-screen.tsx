import Link from "next/link";
import type { ProspectEmpty, ProspectView } from "@/lib/marketing/prospects/present";

export type ProspectClientOption = {
  id: string;
  name: string;
  traxyLiveRead: boolean;
  apolloLiveRead: boolean;
  traxyConnectionName: string;
  apolloConnectionName: string;
  apolloSavedOnly: boolean;
};

const SOURCES = [
  { id: "", label: "All sources" },
  { id: "traxy", label: "Traxy" },
  { id: "apollo", label: "Apollo" },
] as const;

function hrefFor(clientId: string, source: string) {
  const params = new URLSearchParams();
  if (clientId) params.set("client", clientId);
  if (source) params.set("source", source);
  const query = params.toString();
  return query ? `/marketing/prospects?${query}` : "/marketing/prospects";
}

function when(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(date);
}

function connectionLabel(name: string) {
  return name.trim() ? name.trim() : "Primary";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-ink">{value || "Not shared"}</dd>
    </div>
  );
}

export function ProspectsScreen({
  clients,
  clientId,
  source,
  rows,
  empty,
  selected,
}: {
  clients: ProspectClientOption[];
  clientId: string;
  source: "" | "traxy" | "apollo";
  rows: ProspectView[];
  empty: ProspectEmpty;
  selected: ProspectClientOption | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">People from Traxy and Apollo stay in jAI. A later step can add a selection to an audience. This page does not upload one.</p>
      <form method="get" className="flex flex-wrap items-end gap-3" action="/marketing/prospects">
        <label className="flex min-w-56 flex-col gap-1 text-sm">
          <span className="text-muted">Client</span>
          <select name="client" defaultValue={clientId} className="min-h-11 rounded-lg border border-line bg-card px-3 text-ink">
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </label>
        {source ? <input type="hidden" name="source" value={source} /> : null}
        <button className="btn-brand min-h-11 rounded-full px-4 text-sm" type="submit">Show</button>
      </form>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Source">
        {SOURCES.map((item) => {
          const active = source === item.id;
          return (
            <Link
              key={item.id || "all"}
              href={hrefFor(clientId, item.id)}
              aria-current={active ? "page" : undefined}
              className={active ? "btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" : "inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm text-ink"}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      {selected ? (
        <p className="text-sm text-muted">
          Traxy {selected.traxyLiveRead ? `live read on (${connectionLabel(selected.traxyConnectionName)})` : "not connected"}.
          {" "}Apollo {selected.apolloLiveRead ? `live read on (${connectionLabel(selected.apolloConnectionName)})` : "not connected"}.
          {selected.apolloSavedOnly ? " Apollo saved searches are stored and are not queried yet." : ""}
        </p>
      ) : null}
      {empty ? (
        <div className="rounded-xl border border-line bg-card p-6">
          <p className="text-base font-semibold text-ink">{empty.title}</p>
          <p className="mt-2 max-w-2xl text-sm text-muted">{empty.body}</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead className="bg-card text-muted">
                <tr>
                  {["Name", "Title", "Company", "Location", "Email", "Phone", "Profile", "ICP", "Intent", "Tier", "Signal", "First seen", "Last seen", "Source"].map((label) => (
                    <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id || `${row.source}-${row.displayName}`} className="border-t border-line">
                    <td className="px-3 py-3 font-medium text-ink">{row.displayName}</td>
                    <td className="px-3 py-3">{row.headline || "—"}</td>
                    <td className="px-3 py-3">{row.company || "—"}</td>
                    <td className="px-3 py-3">{row.location || "—"}</td>
                    <td className="px-3 py-3">{row.emails.join(", ") || "Not shared"}</td>
                    <td className="px-3 py-3">{row.phones.join(", ") || "Not shared"}</td>
                    <td className="px-3 py-3">
                      {row.profileUrl ? <a className="font-semibold text-ink underline decoration-brand" href={row.profileUrl} rel="noreferrer">Profile</a> : "Not shared"}
                    </td>
                    <td className="px-3 py-3">{row.icpMatchPercent == null ? "—" : `${row.icpMatchPercent}%`}</td>
                    <td className="px-3 py-3">{row.intentScore == null ? "—" : row.intentScore}</td>
                    <td className="px-3 py-3">{row.tier || "—"}</td>
                    <td className="max-w-xs px-3 py-3">{row.signal || "—"}</td>
                    <td className="px-3 py-3">{when(row.firstSeenAt)}</td>
                    <td className="px-3 py-3">{when(row.lastSeenAt)}</td>
                    <td className="px-3 py-3 capitalize">{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((row) => (
              <article key={row.id || `${row.source}-${row.displayName}`} className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold text-ink">{row.displayName}</h2>
                  <span className="rounded-full border border-line px-2 py-1 text-xs capitalize text-ink">{row.source}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Title" value={row.headline} />
                  <Field label="Company" value={row.company} />
                  <Field label="Location" value={row.location} />
                  <Field label="ICP match" value={row.icpMatchPercent == null ? "" : `${row.icpMatchPercent}%`} />
                  <Field label="Intent" value={row.intentScore == null ? "" : String(row.intentScore)} />
                  <Field label="Tier" value={row.tier} />
                  <Field label="Email" value={row.emails.join(", ")} />
                  <Field label="Phone" value={row.phones.join(", ")} />
                  <Field label="First seen" value={when(row.firstSeenAt)} />
                  <Field label="Last seen" value={when(row.lastSeenAt)} />
                </dl>
                {row.signal ? <p className="mt-3 text-sm text-ink">{row.signal}</p> : null}
                {row.profileUrl ? <a className="mt-3 inline-flex min-h-11 items-center font-semibold text-ink underline decoration-brand" href={row.profileUrl} rel="noreferrer">Profile</a> : null}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
