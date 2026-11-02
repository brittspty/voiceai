import Link from "next/link";
import { BRAND_WORDMARK } from "@/lib/brand";
import { getCurrentUser } from "@/lib/auth";
import { getOrg } from "@/lib/queries";
import { MISSING_BODY, MISSING_TITLE } from "@/lib/ux/missing-page";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

function MissingCard({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="max-w-lg rounded-xl border border-line bg-card p-6">
        <p className="text-sm text-muted">{BRAND_WORDMARK}</p>
        <h1 className="mt-2 text-2xl font-semibold">{MISSING_TITLE}</h1>
        <p className="mt-2 text-sm">{MISSING_BODY}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {signedIn ? (
            <Link href="/" className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm">Back to home</Link>
          ) : (
            <>
              <Link href="/login" className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm">Sign in</Link>
              <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">Go to homepage</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LegacyNotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 text-center">
      <div>
        <p className="text-sm text-muted">{BRAND_WORDMARK}</p>
        <h1 className="mt-2 text-2xl font-semibold">That page is not here</h1>
        <Link href="/login" className="mt-3 inline-block text-sm underline">Back to sign in</Link>
      </div>
    </div>
  );
}

async function LaunchNotFound() {
  const user = await getCurrentUser();
  if (!user) return <MissingCard signedIn={false} />;
  const org = await getOrg();
  const { SignedInShell } = await import("@/components/signed-in-shell");
  return (
    <SignedInShell user={user} org={org} path="">
      <MissingCard signedIn />
    </SignedInShell>
  );
}

export default function NotFound() {
  if (!uxLaunchGapsEnabled()) return <LegacyNotFound />;
  return <LaunchNotFound />;
}
