import Link from "next/link";
import { PageTitle } from "@/components/shell";
import { AIS2L_NAME, PRODUCT_NAME } from "@/lib/brand";
import { getOrg } from "@/lib/queries";
import { appHomePath } from "@/lib/public-routing";

export const metadata = { title: "Help" };

const GUIDES = [
  {
    title: "Connect GoHighLevel",
    body: "Avery reads new leads from GoHighLevel and writes call notes back. Open Connections and ask Specificity to link your location if it says Not connected.",
    href: "/settings/integrations",
    action: "Open connections",
  },
  {
    title: "Upload a do-not-call list",
    body: "Add a number, or paste a list with one phone number per line. Avery will not call those numbers.",
    href: "/calls/do-not-call",
    action: "Open the list",
  },
  {
    title: "What test mode means",
    body: "The amber status says Test mode: no real calls. Avery only dials test numbers. Real leads are called after you finish the go-live checklist and type GO LIVE.",
    href: "/settings/production",
    action: "Open the checklist",
  },
  {
    title: "Read your results",
    body: "Overview shows how many people answered and how many meetings were booked. Use the period menu for today, 7 days, or 30 days. Open a call to read the notes.",
    href: "/",
    action: "Go to overview",
  },
];

export default async function DocsPage() {
  const org = await getOrg();
  return (
    <div className="max-w-3xl">
      <PageTitle title="Help" subtitle={`How to use ${PRODUCT_NAME} at ${org.name}.`} />
      <div className="space-y-3">
        <section className="rounded-xl border border-line bg-card p-4">
          <h2 className="font-medium">{AIS2L_NAME}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Avery is your AI caller.</p>
        </section>
        {GUIDES.map((guide) => (
          <section key={guide.title} className="rounded-xl border border-line bg-card p-4">
            <h2 className="font-medium">{guide.title}</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{guide.body}</p>
            <Link href={guide.href === "/" ? appHomePath() : guide.href} className="mt-2 inline-flex text-sm font-medium underline">{guide.action}</Link>
          </section>
        ))}
        <details className="rounded-xl border border-line bg-card p-4 text-sm">
          <summary className="font-medium">For Specificity support</summary>
          <p className="mt-2 text-zinc-600 dark:text-zinc-300">Webhook addresses, deployment notes, and failed jobs are for the Specificity team. Customers do not need them to go live.</p>
          <Link href="/settings/failed-jobs" className="mt-2 inline-flex underline">Failed jobs</Link>
        </details>
      </div>
    </div>
  );
}
