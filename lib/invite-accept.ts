export const INVITE_INVALID = "This invite link is no longer valid. Ask for a new one.";
export const INVITE_READY = "Your account is ready, sign in";
export const INVITE_PASSWORD_SET = "Your password is set.";
export const INVITE_MISMATCH = "Those passwords don't match.";
export const INVITE_SHORT_PASSWORD = "Use at least 10 characters.";

export type AcceptInviteResult = {
  status: "done" | "ready" | "invalid" | "error";
  message: string;
};

/** What to tell the person. An existing account is ready to sign in, even if the invite itself has expired. */
export function decideAcceptInvite(input: {
  password: string;
  invite: { expiresAt: number } | null;
  userExists: boolean;
  now: number;
}): AcceptInviteResult {
  if (input.invite && input.userExists) return { status: "ready", message: INVITE_READY };
  if (!input.invite || input.invite.expiresAt < input.now) return { status: "invalid", message: INVITE_INVALID };
  if (input.password.length < 10) return { status: "error", message: INVITE_SHORT_PASSWORD };
  return { status: "done", message: INVITE_PASSWORD_SET };
}

export function inviteFollowup(status: "done" | "ready") {
  if (status === "done") return { before: "Your password is set. ", link: "Sign in", href: "/login" };
  return { before: "Your account is ready, ", link: "sign in", href: "/login" };
}
