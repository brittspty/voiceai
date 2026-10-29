import Link from "next/link";
import { BRAND_WORDMARK } from "@/lib/brand";

export default function NotFound() {
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
