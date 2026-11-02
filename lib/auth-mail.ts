import { PRODUCT_NAME } from "./brand/names";
import { flagOn, type Env } from "./marketing/config";

export type AuthMailRow = {
  toAddress: string;
  subject: string;
  body: string;
  transport: string;
};

/** Off unless AUTH_EMAIL_LIVE is explicitly on. Voice and other sends stay on INTEGRATIONS_MODE. */
export function authEmailLive(env: Env = process.env) {
  return flagOn(env, "AUTH_EMAIL_LIVE");
}

/** True only when the switch is on and Resend has a key and a from-address. The key is not returned. */
export function authEmailCanSend(env: Env = process.env) {
  return authEmailLive(env) && Boolean(env.RESEND_API_KEY?.trim()) && Boolean(env.MAIL_FROM?.trim());
}

export async function sendAuthEmail(input: {
  to: string;
  subject: string;
  text: string;
  env?: Env;
}) {
  const env = input.env ?? process.env;
  if (!authEmailLive(env)) return { sent: false as const };
  const key = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (!key || !from) return { sent: false as const };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });
  return { sent: res.ok };
}

/**
 * Sign-in links and password resets.
 * AUTH_EMAIL_LIVE may use Resend while INTEGRATIONS_MODE=mock still mocks voice and other mail.
 * Otherwise the message is stored as transport "would send" and nothing is fetched.
 */
export async function deliverAuthEmail(input: {
  to: string;
  subject: string;
  text: string;
  env?: Env;
  record: (row: AuthMailRow) => Promise<void>;
  log?: (line: string) => void;
  logLine?: string;
  send?: typeof sendAuthEmail;
}) {
  const env = input.env ?? process.env;
  const send = input.send ?? sendAuthEmail;
  if (authEmailLive(env)) {
    const result = await send({ to: input.to, subject: input.subject, text: input.text, env });
    if (result.sent) {
      await input.record({ toAddress: input.to, subject: input.subject, body: input.text, transport: "resend" });
      return { sent: true as const, transport: "resend" as const };
    }
  }
  await input.record({ toAddress: input.to, subject: input.subject, body: input.text, transport: "would send" });
  input.log?.(input.logLine ?? `would send ${PRODUCT_NAME} mail to ${input.to}`);
  return { sent: false as const, transport: "would send" as const };
}
