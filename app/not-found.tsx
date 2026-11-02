import Link from "next/link";
import { BRAND_WORDMARK } from "@/lib/brand";
import { getCurrentUser } from "@/lib/auth";
import { MISSING_BODY, MISSING_TITLE } from "@/lib/ux/missing-page";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export default async function NotFound() {
  if (!uxLaunchGapsEnabled()) {
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
  const user = await getCurrentUser();
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="max-w-lg rounded-xl border border-line bg-card p-6">
        <p className="text-sm text-muted">{BRAND_WORDMARK}</p>
        <h1 className="mt-2 text-2xl font-semibold">{MISSING_TITLE}</h1>
        <p className="mt-2 text-sm">{MISSING_BODY}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {user ? (
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
