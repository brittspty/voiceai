"use client";

import Link from "next/link";
import { trackHomepageCta } from "@/lib/homepage-analytics";

export function TrackedLink({
  href,
  cta,
  className,
  children,
}: {
  href: string;
  cta: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className} data-cta={cta} onClick={() => trackHomepageCta(cta)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} data-cta={cta} onClick={() => trackHomepageCta(cta)}>
      {children}
    </Link>
  );
}
