import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { BRAND_WORDMARK } from "@/lib/brand";
import { passwordResetEnabled } from "@/lib/marketing/config";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token || "";
  if (!passwordResetEnabled()) {
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
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        <p className="mt-2 text-sm text-muted">Use at least 12 characters, with upper and lower case letters and a number. This signs you out everywhere else.</p>
        <ResetPasswordForm token={token} />
        <p className="mt-4 text-sm">
          <a className="font-medium underline" href="mailto:support@specificityinc.com?subject=Password%20reset">Email support</a>
        </p>
        <p className="mt-4 text-sm"><Link href="/forgot-password" className="underline">Request a new link</Link></p>
      </div>
    </main>
  );
}
