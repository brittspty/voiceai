import { buildLineage, isAudienceSource, isVerifiedConversion, type AudienceSource } from "../audience-source";
import { trustForAudience, type TruthRole, type TrustTier } from "../provenance";
import { parseCsv } from "./csv";
import { applyMapping, type ColumnMap } from "./mapping";
import { checkRows, type FieldRule } from "./quality";

export type IntakeKind =
  | "csv"
  | "google_sheets"
  | "webhook"
  | "offline_conversion"
  | "crm_revenue"
  | "call_outcome"
  | "audience_intent"
  | "third_party";

export function trustForKind(kind: IntakeKind, audienceSource: AudienceSource): { trustTier: TrustTier; truthRole: TruthRole } {
  if (kind === "crm_revenue" || kind === "call_outcome" || audienceSource === "crm_first_party") {
    return { trustTier: "crm", truthRole: "ground_truth" };
  }
  return trustForAudience(audienceSource);
}

export type IntakeRequest = {
  csv?: string;
  headers?: string[];
  grid?: string[][];
  maps: ColumnMap[];
  rules: FieldRule[];
  kind: IntakeKind;
  audienceSource: string;
  vendor?: string;
  listId?: string;
  segmentKey?: string;
  subSegmentKey?: string;
  audienceKey?: string;
};

export function ingestTable(input: IntakeRequest) {
  const table = input.csv
    ? parseCsv(input.csv)
    : { headers: input.headers ?? input.grid?.[0] ?? [], rows: input.grid?.slice(input.headers ? 0 : 1) ?? [] };
  const audienceSource = input.audienceSource;
  if (!isAudienceSource(audienceSource)) {
    return { ok: false as const, error: "Unknown audience source.", accepted: [], rejected: [] };
  }
  if (audienceSource === "maid_market" && (!input.vendor?.trim() || !input.listId?.trim())) {
    return { ok: false as const, error: "MAID intake needs a vendor and a list id.", accepted: [], rejected: [] };
  }
  const mapped = applyMapping(table.headers, table.rows, input.maps);
  const checked = checkRows(mapped, input.rules);
  const trust = trustForKind(input.kind, audienceSource);
  const rows = checked.map((row) => {
    const lineage = buildLineage({
      audienceSource,
      vendor: input.vendor || String(row.fields.vendor ?? ""),
      listId: input.listId || String(row.fields.list_id ?? ""),
      intent: String(row.fields.intent ?? ""),
      geo: String(row.fields.geo ?? ""),
      demographics: String(row.fields.demographics ?? ""),
      behavior: String(row.fields.behavior ?? ""),
      segmentKey: input.segmentKey || String(row.fields.segment ?? ""),
      subSegmentKey: input.subSegmentKey || String(row.fields.sub_segment ?? ""),
      audienceKey: input.audienceKey || String(row.fields.audience ?? ""),
      duplicate: row.duplicate,
      contactValid: row.contactValid,
    });
    const verified = isVerifiedConversion({
      audienceSource,
      duplicate: row.duplicate,
      contactValid: row.contactValid,
    });
    return {
      ...row,
      ...lineage,
      verified,
      kind: input.kind,
      trustTier: trust.trustTier,
      truthRole: trust.truthRole,
    };
  });
  return {
    ok: true as const,
    accepted: rows.filter((row) => row.status === "accepted"),
    rejected: rows.filter((row) => row.status === "rejected"),
  };
}

/** Allsource is a MAID vendor. The live pull is a stub until that feed is connected. */
export const allsourceAdapter = {
  id: "allsource",
  kind: "third_party" as const,
  audienceSource: "maid_market" as const,
  vendor: "allsource",
  async pull(): Promise<{ listId: string; fields: Record<string, string> }[]> {
    return [];
  },
};
