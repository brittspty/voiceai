import { prisma } from "../db";
import { sendDigestEmail } from "../mail";
import { digestSendEnabled, type Env } from "./config";
import type { DigestPayload } from "./digest";

export type DigestTransportName = "log" | "resend";

/** Test mode, the test runner, and mock integrations never call Resend. */
export function selectDigestTransport(env: Env, testMode: boolean): DigestTransportName {
  if (testMode) return "log";
  if ((env.NODE_ENV || "").trim() === "test") return "log";
  if ((env.INTEGRATIONS_MODE || "mock").trim().toLowerCase() !== "live") return "log";
  if (!(env.RESEND_API_KEY || "").trim() || !(env.MAIL_FROM || "").trim()) return "log";
  return "resend";
}

export function digestDispatchPlan(env: Env, testMode: boolean) {
  if (!digestSendEnabled(env)) return { deliver: false as const, transport: "none" as const };
  return { deliver: true as const, transport: selectDigestTransport(env, testMode) };
}

function lines(title: string, rows: { title: string; summary: string }[]) {
  if (!rows.length) return "";
  return [`${title}`, ...rows.map((row) => `- ${row.title}. ${row.summary}`)].join("\n");
}

export function digestEmail(input: { name: string; payload: DigestPayload }) {
  const decisions = (input.payload.decisions ?? []).map((row) => ({
    title: row.prompt === "pause" ? `Pause? ${row.title}` : `Rotate? ${row.title}`,
    summary: `${row.reason} Yes or no is in the app.`,
  }));
  const parts = [
    `Hi ${input.name.trim() || "there"},`,
    "",
    "Here is your hourly summary. It only includes campaigns and clients assigned to you.",
    lines("Needs a look", input.payload.alerts),
    lines("Suggestions", input.payload.recommendations),
    lines("Waiting for yes or no", decisions),
    (input.payload.notes ?? []).length ? ["Notes", ...(input.payload.notes ?? []).map((note) => `- ${note}`)].join("\n") : "",
    "Open Marketing to answer.",
  ].filter((part) => part && part.trim());
  return {
    subject: "Your hourly summary",
    text: parts.join("\n\n"),
  };
}

export async function dispatchDigestDelivery(input: {
  digestId: string;
  userId: string;
  email: string;
  name: string;
  payload: DigestPayload;
  testMode: boolean;
  env?: Env;
}) {
  const env = input.env ?? process.env;
  const plan = digestDispatchPlan(env, input.testMode);
  if (!plan.deliver) return { delivery: "not_sent" as const, transport: "none" as const };
  const message = digestEmail({ name: input.name, payload: input.payload });
  await prisma.staffNotification.create({
    data: {
      userId: input.userId,
      kind: "digest",
      title: message.subject,
      body: message.text,
      href: "/marketing",
      payload: input.payload,
    },
  });
  if (plan.transport === "log") {
    await prisma.mailLog.create({
      data: { toAddress: input.email, subject: message.subject, body: message.text, transport: "log" },
    });
    await prisma.managerDigest.update({ where: { id: input.digestId }, data: { delivery: "logged" } });
    return { delivery: "logged" as const, transport: "log" as const };
  }
  const sent = await sendDigestEmail({ to: input.email, subject: message.subject, text: message.text, env });
  if (!sent.sent) {
    await prisma.mailLog.create({
      data: { toAddress: input.email, subject: message.subject, body: message.text, transport: "log" },
    });
    await prisma.managerDigest.update({ where: { id: input.digestId }, data: { delivery: "logged" } });
    return { delivery: "logged" as const, transport: "log" as const };
  }
  await prisma.managerDigest.update({ where: { id: input.digestId }, data: { delivery: "sent" } });
  return { delivery: "sent" as const, transport: "resend" as const };
}
