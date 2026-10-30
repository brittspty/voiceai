import Link from "next/link";
import { formatCount, formatMoney, homeKpiTotals, type HomeModel } from "@/lib/marketing/home-dashboard";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-[14px] border border-line bg-card px-3.5 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </article>
  );
}

export function HomeDashboard({ model, choices }: { model: HomeModel; choices: { id: string; name: string }[] }) {
  if (model.denied) {
    return (
      <div>
        <h1 className="text-[22px] font-semibold">Home</h1>
        <p className="mt-2 text-sm text-muted">{model.subtitle}</p>
      </div>
    );
  }
  const totals = homeKpiTotals(model.clients);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">{model.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{model.subtitle}</p>
        </div>
        {model.canPickClient && choices.length > 1 && (
          <form className="flex flex-wrap items-center gap-2" method="get">
            <label className="text-xs text-muted" htmlFor="client">
              Client
            </label>
            <select id="client" name="client" defaultValue={model.selectedId ?? ""} className="min-h-11 rounded-[10px] border border-line bg-card px-2.5">
              <option value="">All clients</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </select>
            <button className="min-h-11 rounded-[10px] border border-ink bg-ink px-3 font-semibold text-on-ink" type="submit">
              Open
            </button>
          </form>
        )}
        {model.selectedId && choices.length > 1 && (
          <Link className="inline-flex min-h-11 items-center font-medium text-info" href="/">
            ← All clients
          </Link>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Views" value={formatCount(totals.views)} hint="Last 30 days" />
        <Tile label="Leads" value={formatCount(totals.leads)} hint="Last 30 days" />
        <Tile label="Calls" value={formatCount(totals.calls)} hint="From ad campaigns" />
        {model.showMoney && <Tile label="Spend" value={formatMoney(totals.spend)} hint="Last 30 days" />}
      </div>

      <section className="mb-4 rounded-[14px] border border-line bg-card p-4">
        <h2 className="text-base font-semibold">{model.aggregate ? "Clients" : "This client"}</h2>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Client</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Platforms</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Views</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Leads</th>
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Calls</th>
                {model.showMoney && <th scope="col" className="border-b border-line px-2 py-2 font-medium">Spend</th>}
                <th scope="col" className="border-b border-line px-2 py-2 font-medium">Voice</th>
              </tr>
            </thead>
            <tbody>
              {model.clients.map((client) => (
                <tr key={client.id} className="hover:bg-warning-soft">
                  <td className="border-b border-line px-2 py-2.5">
                    {model.aggregate ? (
                      <Link className="font-semibold hover:underline" href={`/?client=${encodeURIComponent(client.id)}`}>
                        {client.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{client.name}</span>
                    )}
                  </td>
                  <td className="border-b border-line px-2 py-2.5">{client.platforms.length ? client.platforms.join(", ") : "—"}</td>
                  <td className="border-b border-line px-2 py-2.5">{formatCount(client.views)}</td>
                  <td className="border-b border-line px-2 py-2.5">{formatCount(client.leads)}</td>
                  <td className="border-b border-line px-2 py-2.5">{formatCount(client.calls)}</td>
                  {model.showMoney && <td className="border-b border-line px-2 py-2.5">{formatMoney(client.spend ?? 0)}</td>}
                  <td className="border-b border-line px-2 py-2.5">{client.voiceEnabled ? "On" : "Not included"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 md:hidden">
          {model.clients.map((client) => (
            <Link key={client.id} href={model.aggregate ? `/?client=${encodeURIComponent(client.id)}` : "/"} className="block rounded-xl border border-line p-3">
              <span className="font-semibold">{client.name}</span>
              <span className="mt-1 block text-sm text-muted">
                {formatCount(client.leads)} leads · {formatCount(client.calls)} calls
                {model.showMoney ? ` · ${formatMoney(client.spend ?? 0)}` : ""}
              </span>
              <span className="mt-1 block text-xs text-muted">{client.voiceEnabled ? "Voice add-on on" : "Voice not included"}</span>
            </Link>
          ))}
        </div>
        {!model.clients.length && <p className="mt-3 text-sm text-muted">No clients in this view yet.</p>}
      </section>

      <section className="mb-4">
        <h2 className="mb-3 text-base font-semibold">Marketing</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {model.features.map((feature) => (
            <article key={feature.id} className="rounded-[14px] border border-line border-l-4 border-l-brand bg-card p-4">
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted">{feature.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {model.voice && (
        <section className="rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-semibold">Voice</h2>
          <p className="mt-1 text-sm text-muted">
            A separate add-on for {model.voice.clients.join(", ")}. It is not part of the ad totals above.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Tile label="Dials" value={formatCount(model.voice.dials)} hint="Last 7 days" />
            <Tile label="Answered" value={formatCount(model.voice.answered)} />
            <Tile label="Meetings" value={formatCount(model.voice.meetings)} />
          </div>
        </section>
      )}
    </div>
  );
}
