import Link from "next/link";

export function PublicPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-12">
      <p className="text-sm text-muted"><Link href="/login" className="underline">VoiceOps</Link></p>
      <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
      <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{children}</div>
      <footer className="mt-10 text-xs text-muted">© Specificity Inc · <Link className="underline" href="/privacy">Privacy</Link> · <Link className="underline" href="/terms">Terms</Link> · <Link className="underline" href="/contact">Support</Link></footer>
    </main>
  );
}
