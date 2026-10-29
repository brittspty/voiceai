import Link from "next/link";
import { BRAND_WORDMARK } from "@/lib/brand";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          This page does not send email. Write to support@specificityinc.com from the address you use to sign in, and {BRAND_WORDMARK} will help you within 1 business day.
        </p>
        <p className="mt-4 text-sm">
          <a className="font-medium underline" href="mailto:support@specificityinc.com?subject=Password%20reset">Email support</a>
        </p>
        <p className="mt-4 text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}
