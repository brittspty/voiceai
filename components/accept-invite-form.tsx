"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptInvite } from "@/lib/actions";
import { inviteFollowup, INVITE_MISMATCH, type AcceptInviteResult } from "@/lib/invite-accept";

type InviteFormState = AcceptInviteResult | { status: "idle"; message: "" };

async function submitInvite(token: string, _previous: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password !== confirm) return { status: "error", message: INVITE_MISMATCH };
  try {
    return await acceptInvite({ token, password });
  } catch (reason) {
    return { status: "error", message: reason instanceof Error ? reason.message : "Could not accept the invite." };
  }
}

export function AcceptInviteForm({ token, wordmark }: { token: string; wordmark: string }) {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(
    (previous, formData) => submitInvite(token, previous, formData),
    { status: "idle", message: "" },
  );
  const follow = state.status === "done" || state.status === "ready" ? inviteFollowup(state.status) : null;
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-6">
        <h1 className="text-lg font-semibold">Join {wordmark}</h1>
        {follow ? (
          <p className="mt-4 text-sm">{follow.before}<Link className="underline" href={follow.href}>{follow.link}</Link></p>
        ) : (
          <form className="mt-4 space-y-3" action={action}>
            <label className="block text-sm">Password
              <input name="password" type="password" required autoComplete="new-password" minLength={10} className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
            </label>
            <label className="block text-sm">Confirm password
              <input name="confirm" type="password" required autoComplete="new-password" minLength={10} className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
            </label>
            {state.status === "error" || state.status === "invalid" ? <p className="text-sm text-danger">{state.message}</p> : null}
            <button className="btn-brand h-10 w-full rounded-full text-sm" disabled={pending}>Set password</button>
          </form>
        )}
      </div>
    </main>
  );
}
