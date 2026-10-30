import type { Env } from "../config";
import { accessFromUser } from "../access";

export type ConversionAccess =
  | { ok: false }
  | {
      ok: true;
      edit: boolean;
      seesValue: boolean;
      reconnectGoogle: boolean;
      reconnectMeta: boolean;
    };

/** Super admins edit. Account managers view. Everyone else, including clients, is refused. */
export function conversionAccess(user: { id: string; role: string; email: string }, env: Env = process.env): ConversionAccess {
  const access = accessFromUser({ id: user.id, email: user.email, role: user.role }, [], env);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") return { ok: false };
  const edit = access.kind === "super_admin";
  return {
    ok: true,
    edit,
    seesValue: access.seesCost,
    reconnectGoogle: edit,
    reconnectMeta: true,
  };
}

export function googleOAuthStartUrl(env: Env, redirectUri: string, state: string) {
  const clientId = (env.GOOGLE_ADS_CLIENT_ID || "").trim();
  if (!clientId || !redirectUri || !state) return null;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

export type ConnectPage = {
  title: string;
  body: string;
  redirectUrl: string | null;
  asksForPassword: false;
};

export function connectPageModel(
  platform: "meta" | "google",
  access: Extract<ConversionAccess, { ok: true }>,
  env: Env,
  redirectUri: string,
  state = "",
): ConnectPage {
  if (platform === "google") {
    if (!access.reconnectGoogle) {
      return {
        title: "Reconnect Google",
        body: "A super admin reconnects Google. This page never asks for a password.",
        redirectUrl: null,
        asksForPassword: false,
      };
    }
    const redirectUrl = googleOAuthStartUrl(env, redirectUri, state);
    return {
      title: "Reconnect Google",
      body: redirectUrl
        ? "Google's sign-in opens next. VoiceOps never asks for your password."
        : "Google is not connected yet. A super admin adds the developer token and OAuth client outside this page. VoiceOps never asks for a password.",
      redirectUrl,
      asksForPassword: false,
    };
  }
  return {
    title: "Reconnect Meta",
    body: "Each client has its own Meta dataset id, saved on Conversion feedback. The conversions token is set outside this page. VoiceOps never asks for a password.",
    redirectUrl: null,
    asksForPassword: false,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export function renderConnectPopup(page: ConnectPage) {
  const next = page.redirectUrl
    ? `<p><a href="${escapeHtml(page.redirectUrl)}">Continue to Google</a></p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(page.title)}</title></head>
<body>
  <h1>${escapeHtml(page.title)}</h1>
  <p>${escapeHtml(page.body)}</p>
  ${next}
</body>
</html>`;
}
