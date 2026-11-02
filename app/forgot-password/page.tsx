import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { BRAND_WORDMARK } from "@/lib/brand";
import { authEmailCanSend } from "@/lib/auth-mail";
import { passwordResetEnabled } from "@/lib/marketing/config";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  const enabled = passwordResetEnabled();
  if (uxLaunchGapsEnabled() && !enabled) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
          <h1 className="text-lg font-semibold">Password reset is paused</h1>
          <p className="mt-4 text-sm leading-6">We&apos;ve paused reset emails during launch. Ask your Specificity admin to reset your password.</p>
          <p className="mt-4 text-sm"><Link href="/login" className="btn-brand inline-flex min-h-11 items-center rounded-full px-4">Back to sign in</Link></p>
        </div>
      </main>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        {enabled ? (
          <>
            <ForgotPasswordForm emailSends={authEmailCanSend()} />
            <p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              If email is not arriving, write to support@specificityinc.com from the address you use to sign in, and {BRAND_WORDMARK} will help you within 1 business day.
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            This page does not send email. Write to support@specificityinc.com from the address you use to sign in, and {BRAND_WORDMARK} will help you within 1 business day.
          </p>
        )}
        <p className="mt-4 text-sm">
          <a className="font-medium underline" href="mailto:support@specificityinc.com?subject=Password%20reset">Email support</a>
        </p>
        <p className="mt-4 text-sm"><Link href="/login" className="underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}
