import Link from "next/link";
import { DEMO_FACTS } from "@/lib/demo/dataset";
import { DEMO_CONTACT_HREF } from "@/lib/demo/routes";
import { renderTourSteps, tourLocation } from "@/lib/demo/tour";

export function DemoEntry({ view, tourEnabled }: { view: "staff" | "client"; tourEnabled: boolean }) {
  const staff = view === "staff";
  const first = renderTourSteps(DEMO_FACTS)[0];
  const tour = tourEnabled && first ? tourLocation(first, "present", view, 0) : "/demo";
  const self = tourEnabled && first ? tourLocation(first, "self", view, 0) : "/demo";
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-line bg-card p-4 md:p-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Staff or client view">
        <Link href="/demo?view=staff" aria-current={staff ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${staff ? "btn-brand" : "border border-line"}`}>
          Staff
        </Link>
        <Link href="/demo?view=client" aria-current={!staff ? "true" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${!staff ? "btn-brand" : "border border-line"}`}>
          Client
        </Link>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link href={tour} className="btn-brand inline-flex min-h-11 items-center justify-center rounded-full px-6 text-base">
          Start the tour
        </Link>
        <Link href={self} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold">
          Guide me
        </Link>
        <Link href={DEMO_CONTACT_HREF} className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold underline">
          Book a call
        </Link>
      </div>
    </div>
  );
}
