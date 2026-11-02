import { createHash, randomBytes } from "node:crypto";
import { authEmailCanSend, deliverAuthEmail, type AuthMailRow } from "./auth-mail";
import { PRODUCT_NAME } from "./brand/names";
import { authLinkOrigin } from "./hosts";
import { envEnabled, type Env } from "./public-routing";

/** Off unless MAGIC_LINK_ENABLED is explicitly on. */
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export const WORK_EMAIL_ERROR = "Enter the email you use for work, like name@company.com.";

export const MAGIC_LINK_READY = "If that work email has an account, a sign-in link is ready. Nothing was emailed.";

export const MAGIC_LINK_INVALID = "That sign-in link is no longer valid. Ask for a new one.";

/**
 * MAGIC_LINK_ENABLED gates the feature.
 * Mail is logged as "would send" until AUTH_EMAIL_LIVE is on.
 * AUTH_EMAIL_LIVE may use Resend while INTEGRATIONS_MODE stays mock.
 */
export function magicLinkEnabled(env: Env = process.env) {
  return envEnabled(env.MAGIC_LINK_ENABLED);
}

export function magicLinkMessage(env: Env = process.env) {
  if (authEmailCanSend(env)) return "If that work email has an account, a sign-in link is on its way.";
  return MAGIC_LINK_READY;
}

export function workEmailError(raw: string) {
  const email = raw.trim().toLowerCase();
  if (!email || email.includes(" ") || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) return WORK_EMAIL_ERROR;
  const domain = email.split("@")[1] || "";
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return WORK_EMAIL_ERROR;
  return null;
}

export function normalizeWorkEmail(raw: string) {
  if (workEmailError(raw)) return null;
  return raw.trim().toLowerCase();
}

export type MagicLinkRecord = {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type MagicLinkStore = {
  create(row: MagicLinkRecord): Promise<void>;
  find(tokenHash: string): Promise<MagicLinkRecord | null>;
  /** Returns false when the token was already used or is missing. */
  markUsed(tokenHash: string, usedAt: Date): Promise<boolean>;
};

export function hashMagicToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function mintMagicToken(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashMagicToken(token), expiresAt: new Date(now + MAGIC_LINK_TTL_MS) };
}

/** Logs only. Persistence goes through requestMagicLink so a mock request writes MailLog. */
export function deliverMagicLink(email: string, log: (line: string) => void = (line) => console.info(line)) {
  log(`would send magic link to ${email}`);
  return { sent: false as const, logged: "would send" as const };
}

export async function requestMagicLink(input: {
  email: string;
  env?: Env;
  now?: number;
  findUser: (email: string) => Promise<{ email: string } | null>;
  store: MagicLinkStore;
  recordMail: (row: AuthMailRow) => Promise<void>;
  log?: (line: string) => void;
  origin?: string;
  send?: Parameters<typeof deliverAuthEmail>[0]["send"];
}) {
  const env = input.env ?? process.env;
  if (!magicLinkEnabled(env)) return { status: 404 as const };
  const email = normalizeWorkEmail(input.email);
  if (!email) return { status: 400 as const, error: WORK_EMAIL_ERROR };
  const account = await input.findUser(email);
  if (account) {
    const minted = mintMagicToken(input.now ?? Date.now());
    const storedEmail = account.email.trim().toLowerCase();
    await input.store.create({ email: storedEmail, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt, usedAt: null });
    const origin = input.origin ?? authLinkOrigin(env);
    const link = `${origin}/api/auth/magic-link/redeem?token=${encodeURIComponent(minted.token)}`;
    await deliverAuthEmail({
      to: storedEmail,
      subject: `Sign in to ${PRODUCT_NAME}`,
      text: `Use this one-time sign-in link:\n${link}\n\nIt expires in 15 minutes.\n`,
      env,
      record: input.recordMail,
      log: input.log,
      logLine: `would send magic link to ${storedEmail}`,
      send: input.send,
    });
  }
  return { status: 200 as const, sent: false as const, message: magicLinkMessage(env) };
}

export async function redeemMagicLink(input: { token: string; env?: Env; now?: number; store: MagicLinkStore }) {
  const env = input.env ?? process.env;
  if (!magicLinkEnabled(env)) return { status: 404 as const };
  const token = input.token.trim();
  if (!token) return { status: 400 as const, error: MAGIC_LINK_INVALID };
  const now = input.now ?? Date.now();
  const tokenHash = hashMagicToken(token);
  const row = await input.store.find(tokenHash);
  if (!row || row.usedAt || row.expiresAt.getTime() <= now) return { status: 400 as const, error: MAGIC_LINK_INVALID };
  const marked = await input.store.markUsed(tokenHash, new Date(now));
  if (!marked) return { status: 400 as const, error: MAGIC_LINK_INVALID };
  return { status: 200 as const, email: row.email };
}
