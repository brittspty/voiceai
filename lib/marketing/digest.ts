import { digestDeliveryEnabled, digestEnabled, type Env } from "./config";

export type DigestItem = { id: string; title: string; summary: string; accountId: string; workspace?: boolean };

export type DigestDraft = {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  payload: { alerts: DigestItem[]; recommendations: DigestItem[] };
  delivery: "not_sent";
};

/** Stored in the app. This build does not send email or SMS. */
export function digestDeliveryPlan(env: Env = process.env) {
  if (!digestEnabled(env)) return { send: false as const, reason: "digests are turned off" };
  if (!digestDeliveryEnabled(env)) return { send: false as const, reason: "delivery is turned off" };
  return { send: false as const, reason: "delivery is not built in this version" };
}

export function buildManagerDigest(input: {
  userId: string;
  accountIds: "all" | string[];
  alerts: DigestItem[];
  recommendations: DigestItem[];
  periodStart: Date;
  periodEnd: Date;
  env?: Env;
}): DigestDraft | null {
  const env = input.env ?? process.env;
  if (!digestEnabled(env)) return null;
  const allowed = (item: DigestItem) => item.workspace === true || input.accountIds === "all" || input.accountIds.includes(item.accountId);
  const alerts = input.alerts.filter(allowed);
  const recommendations = input.recommendations.filter(allowed);
  if (!alerts.length && !recommendations.length) return null;
  const plan = digestDeliveryPlan(env);
  if (plan.send) throw new Error("Digest delivery must not send.");
  return {
    userId: input.userId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payload: { alerts, recommendations },
    delivery: "not_sent",
  };
}
