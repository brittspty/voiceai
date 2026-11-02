import { createHash, randomBytes } from "node:crypto";
import { deliverAuthEmail, type AuthMailRow } from "./auth-mail";
import { PRODUCT_NAME } from "./brand/names";
import { authLinkOrigin } from "./hosts";
import { passwordIssues } from "./marketing/access";
import { passwordResetEnabled, type Env } from "./marketing/config";
import { normalizeWorkEmail } from "./magic-link";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_LIMIT = 5;
export const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;

export const PASSWORD_RESET_MESSAGE = "If that email has an account, password help is on its way.";
export const PASSWORD_RESET_INVALID = "This reset link is no longer valid. Ask for a new one.";
export const PASSWORD_RESET_RATE = "Too many attempts. Wait a few minutes and try again.";

export type PasswordResetRecord = {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type PasswordResetStore = {
  create(row: PasswordResetRecord): Promise<void>;
  find(tokenHash: string): Promise<PasswordResetRecord | null>;
  markUsed(tokenHash: string, usedAt: Date): Promise<boolean>;
};

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function mintResetToken(now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(now + PASSWORD_RESET_TTL_MS) };
}

export function clientIp(header: string | null | undefined) {
  const first = (header || "").split(",")[0]?.trim();
  return first || "local";
}

export function consumeRateLimit(
  store: Map<string, { n: number; at: number }>,
  key: string,
  now: number,
  limit = PASSWORD_RESET_LIMIT,
  windowMs = PASSWORD_RESET_WINDOW_MS,
) {
  const current = store.get(key);
  const fresh = !current || now - current.at >= windowMs;
  const bucket = fresh ? { n: 1, at: now } : { n: current.n + 1, at: current.at };
  store.set(key, bucket);
  return bucket.n > limit;
}

const buckets = new Map<string, { n: number; at: number }>();

export async function requestPasswordReset(input: {
  email: string;
  ip?: string;
  env?: Env;
  now?: number;
  findUser: (email: string) => Promise<{ email: string } | null>;
  store: PasswordResetStore;
  recordMail: (row: AuthMailRow) => Promise<void>;
  log?: (line: string) => void;
  origin?: string;
  limits?: Map<string, { n: number; at: number }>;
  send?: Parameters<typeof deliverAuthEmail>[0]["send"];
}) {
  const env = input.env ?? process.env;
  if (!passwordResetEnabled(env)) return { status: 404 as const };
  const email = normalizeWorkEmail(input.email);
  if (!email) return { status: 400 as const, error: "Enter the email you use for work, like name@company.com." };
  const now = input.now ?? Date.now();
  const limited = consumeRateLimit(input.limits ?? buckets, `${email}|${input.ip || "local"}`, now);
  if (limited) return { status: 429 as const, error: PASSWORD_RESET_RATE };
  const account = await input.findUser(email);
  if (account) {
    const minted = mintResetToken(now);
    const storedEmail = account.email.trim().toLowerCase();
    await input.store.create({ email: storedEmail, tokenHash: minted.tokenHash, expiresAt: minted.expiresAt, usedAt: null });
    const origin = input.origin ?? authLinkOrigin(env);
    const link = `${origin}/reset-password?token=${encodeURIComponent(minted.token)}`;
    await deliverAuthEmail({
      to: storedEmail,
      subject: `Reset your ${PRODUCT_NAME} password`,
      text: `Use this link to choose a new password:\n${link}\n\nIt works once and expires in 30 minutes. If you did not ask for this, you can ignore it.\n`,
      env,
      record: input.recordMail,
      log: input.log,
      logLine: `would send password reset to ${storedEmail}`,
      send: input.send,
    });
  }
  return { status: 200 as const, message: PASSWORD_RESET_MESSAGE };
}

export async function confirmPasswordReset(input: {
  token: string;
  password: string;
  env?: Env;
  now?: number;
  store: PasswordResetStore;
  findUser: (email: string) => Promise<{ email: string } | null>;
  savePassword: (email: string, passwordHash: string) => Promise<void>;
  revokeSessions: (email: string) => Promise<void>;
  hashPassword: (password: string) => Promise<string>;
}) {
  const env = input.env ?? process.env;
  if (!passwordResetEnabled(env)) return { status: 404 as const };
  const token = input.token.trim();
  if (!token) return { status: 400 as const, error: PASSWORD_RESET_INVALID };
  const now = input.now ?? Date.now();
  const tokenHash = hashResetToken(token);
  const row = await input.store.find(tokenHash);
  if (!row || row.usedAt || row.expiresAt.getTime() <= now) return { status: 400 as const, error: PASSWORD_RESET_INVALID };
  const account = await input.findUser(row.email);
  if (!account) return { status: 400 as const, error: PASSWORD_RESET_INVALID };
  const issues = passwordIssues(input.password, account.email);
  if (issues.length) return { status: 400 as const, error: issues[0] || "Choose a stronger password." };
  const marked = await input.store.markUsed(tokenHash, new Date(now));
  if (!marked) return { status: 400 as const, error: PASSWORD_RESET_INVALID };
  const email = account.email.trim().toLowerCase();
  await input.savePassword(email, await input.hashPassword(input.password));
  await input.revokeSessions(email);
  return { status: 200 as const };
}
