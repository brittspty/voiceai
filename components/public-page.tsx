import Link from "next/link";
import { PublicBrandLogo } from "@/components/public-brand-logo";
import { BRAND_WORDMARK } from "@/lib/brand";
import { PUBLIC_TAGLINE } from "@/lib/brand/public";

export function PublicPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-12">
      <Link href="/" aria-label="jAI by Specificity"><PublicBrandLogo slot="wordmark-light" height={48} alt="" /></Link>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{children}</div>
      <footer className="mt-10 text-xs text-muted">© {BRAND_WORDMARK} · {PUBLIC_TAGLINE} · <Link className="underline" href="/privacy">Privacy</Link> · <Link className="underline" href="/terms">Terms</Link> · <Link className="underline" href="/contact">Support</Link></footer>
    </main>
  );
}
