import Link from "next/link";

export function DashboardTabs({ current, base }: { current: "campaigns" | "gbp"; base: string }) {
  const tabs = [
    { id: "campaigns" as const, href: base, label: "Campaigns" },
    { id: "gbp" as const, href: `${base}${base.includes("?") ? "&" : "?"}tab=gbp`, label: "Google Business Profile" },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Dashboard sections">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          role="tab"
          aria-selected={current === tab.id}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${current === tab.id ? "border-ink bg-ink text-on-ink" : "border-line bg-card text-ink"}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
