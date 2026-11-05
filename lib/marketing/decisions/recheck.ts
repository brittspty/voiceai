import type { Benchmark } from "../config";
import { hasHumanDecision } from "./collapse";
import { qualifyAdRates, type MetricPoint } from "../monitor";

export const RECHECK_REASON = "recheck_v2";

const MONITOR_CODES = new Set(["ctr_off", "cpc_off", "cpm_off", "ctr_without_results"]);

export type RecheckRecommendation = {
  id: string;
  clientId: string;
  clientName: string;
  type: string;
  rule: string;
  status: string;
  severity: string;
  adId: string | null;
  decidedById: string | null;
  decidedAt: string | null;
  snoozedUntil: string | null;
  archivedAt: string | null;
};

export type RecheckCount = { rule: string; keep: number; archive: number; severity: number };

export type RecheckPlan = {
  dryRun: boolean;
  keep: string[];
  archive: { id: string; reason: typeof RECHECK_REASON }[];
  severity: { id: string; severity: "warning" | "critical" }[];
  clients: { clientId: string; clientName: string; rules: RecheckCount[] }[];
  rules: RecheckCount[];
};

function monitorCode(rule: string) {
  const code = rule.startsWith("ad_alert:") ? rule.slice("ad_alert:".length) : rule;
  return MONITOR_CODES.has(code) ? code : null;
}

function bump(map: Map<string, RecheckCount>, rule: string, field: "keep" | "archive" | "severity") {
  const current = map.get(rule) ?? { rule, keep: 0, archive: 0, severity: 0 };
  current[field] += 1;
  map.set(rule, current);
}

/**
 * Open draft and verified monitor rows only.
 * A person who already decided is left alone. Other recommendation types are left alone.
 */
export function planRecheck(input: {
  rows: readonly RecheckRecommendation[];
  metrics: readonly MetricPoint[];
  today: string;
  benchmarks?: Record<string, Benchmark>;
  apply?: boolean;
}): RecheckPlan {
  const benchmarks = input.benchmarks ?? {};
  const keep: string[] = [];
  const archive: RecheckPlan["archive"] = [];
  const severity: RecheckPlan["severity"] = [];
  const byClient = new Map<string, { clientId: string; clientName: string; rules: Map<string, RecheckCount> }>();
  const byRule = new Map<string, RecheckCount>();

  for (const row of input.rows) {
    if (row.archivedAt) continue;
    if (row.status !== "draft" && row.status !== "verified") continue;
    if (hasHumanDecision(row)) continue;
    const code = monitorCode(row.rule);
    if (!code || !row.adId) continue;
    const qualified = qualifyAdRates({
      rows: input.metrics,
      adId: row.adId,
      today: input.today,
      benchmarks,
    }).find((hit) => hit.code === code);
    const client = byClient.get(row.clientId || "unassigned") ?? {
      clientId: row.clientId || "unassigned",
      clientName: row.clientName || "Unassigned",
      rules: new Map<string, RecheckCount>(),
    };
    if (!qualified) {
      archive.push({ id: row.id, reason: RECHECK_REASON });
      bump(client.rules, row.rule, "archive");
      bump(byRule, row.rule, "archive");
    } else if (qualified.severity !== row.severity) {
      severity.push({ id: row.id, severity: qualified.severity });
      bump(client.rules, row.rule, "severity");
      bump(byRule, row.rule, "severity");
    } else {
      keep.push(row.id);
      bump(client.rules, row.rule, "keep");
      bump(byRule, row.rule, "keep");
    }
    byClient.set(client.clientId, client);
  }

  const clients = [...byClient.values()]
    .map((client) => ({
      clientId: client.clientId,
      clientName: client.clientName,
      rules: [...client.rules.values()].sort((a, b) => a.rule.localeCompare(b.rule)),
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.clientId.localeCompare(b.clientId));

  return {
    dryRun: input.apply !== true,
    keep,
    archive,
    severity,
    clients,
    rules: [...byRule.values()].sort((a, b) => a.rule.localeCompare(b.rule)),
  };
}

/** Missing file cannot apply. A file whose first line is "applied" already ran. */
export function guardState(text: string | null): "missing" | "ready" | "used" {
  if (text === null) return "missing";
  if ((text.split("\n")[0] || "").trim() === "applied") return "used";
  return "ready";
}

export function appliedGuardText(at: string) {
  return `applied\n${at}\n`;
}
