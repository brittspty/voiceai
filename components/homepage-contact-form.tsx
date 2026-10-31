"use client";

import { trackHomepageCta } from "@/lib/homepage-analytics";

export function ContactForm({ children }: { children: React.ReactNode }) {
  return (
    <form id="contact" action="/api/homepage/contact" method="post" data-cta="book-demo-submit" onSubmit={() => trackHomepageCta("book-demo-submit")}>
      {children}
    </form>
  );
}
