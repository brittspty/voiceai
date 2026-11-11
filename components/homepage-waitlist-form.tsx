"use client";

import { trackHomepageCta } from "@/lib/homepage-analytics";

export function WaitlistForm({ children }: { children: React.ReactNode }) {
  return (
    <form id="agency-waitlist-form" action="/api/homepage/waitlist" method="post" data-cta="agency-waitlist-submit" onSubmit={() => trackHomepageCta("agency-waitlist-submit")}>
      {children}
    </form>
  );
}
