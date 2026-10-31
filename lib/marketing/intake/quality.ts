import { hashEmailForMeta, hashPhoneForMeta } from "../offline/hash";
import type { MappedRow } from "./mapping";

export type FieldType = "string" | "number" | "date" | "email" | "phone" | "boolean";

export type FieldRule = {
  field: string;
  type: FieldType;
  required?: boolean;
  outlier?: boolean;
};

export type CheckedRow = {
  row: string;
  status: "accepted" | "rejected";
  reasons: string[];
  fields: Record<string, string | number | boolean | null>;
  emailHash: string;
  phoneHash: string;
  duplicate: boolean;
  contactValid: boolean;
};

const NUMBER = /^-?\d+(\.\d+)?$/;

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function mad(values: number[], center: number) {
  return median(values.map((value) => Math.abs(value - center)));
}

export function checkRows(rows: MappedRow[], rules: FieldRule[]): CheckedRow[] {
  const numeric = new Map<string, number[]>();
  for (const rule of rules) {
    if (rule.type !== "number" || !rule.outlier) continue;
    const values: number[] = [];
    for (const row of rows) {
      const raw = row[rule.field] ?? "";
      if (NUMBER.test(raw)) values.push(Number(raw));
    }
    numeric.set(rule.field, values);
  }
  const seen = new Set<string>();
  return rows.map((row) => checkOne(row, rules, numeric, seen));
}

function checkOne(row: MappedRow, rules: FieldRule[], numeric: Map<string, number[]>, seen: Set<string>): CheckedRow {
  const reasons: string[] = [];
  const fields: Record<string, string | number | boolean | null> = {};
  let emailHash = "";
  let phoneHash = "";
  for (const rule of rules) {
    const raw = (row[rule.field] ?? "").trim();
    if (!raw) {
      if (rule.required) reasons.push(`missing_${rule.field}`);
      fields[rule.field] = null;
      continue;
    }
    if (rule.type === "number") {
      if (!NUMBER.test(raw)) {
        reasons.push(`type_${rule.field}`);
        fields[rule.field] = null;
        continue;
      }
      const value = Number(raw);
      if (rule.outlier) {
        const values = numeric.get(rule.field) ?? [];
        const center = median(values);
        const spread = mad(values, center);
        if (spread > 0 && Math.abs(value - center) / spread > 6) reasons.push(`outlier_${rule.field}`);
      }
      fields[rule.field] = value;
      continue;
    }
    if (rule.type === "date") {
      const parsed = Date.parse(raw);
      if (!Number.isFinite(parsed)) reasons.push(`type_${rule.field}`);
      fields[rule.field] = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
      continue;
    }
    if (rule.type === "boolean") {
      const token = raw.toLowerCase();
      if (!["true", "false", "yes", "no", "1", "0"].includes(token)) reasons.push(`type_${rule.field}`);
      fields[rule.field] = token === "true" || token === "yes" || token === "1";
      continue;
    }
    if (rule.type === "email") {
      emailHash = hashEmailForMeta(raw);
      if (!emailHash) reasons.push("invalid_email");
      fields[rule.field] = emailHash || null;
      continue;
    }
    if (rule.type === "phone") {
      phoneHash = hashPhoneForMeta(raw);
      if (!phoneHash) reasons.push("invalid_phone");
      fields[rule.field] = phoneHash || null;
      continue;
    }
    fields[rule.field] = raw;
  }
  const keys = [
    emailHash ? `e:${emailHash}` : "",
    phoneHash ? `p:${phoneHash}` : "",
    fields.external_id ? `id:${String(fields.external_id)}` : "",
  ].filter(Boolean);
  const duplicate = keys.some((key) => seen.has(key));
  for (const key of keys) seen.add(key);
  if (duplicate) reasons.push("duplicate");
  const contactValid = Boolean(emailHash && phoneHash);
  return {
    row: row.__row,
    status: reasons.length ? "rejected" : "accepted",
    reasons,
    fields,
    emailHash,
    phoneHash,
    duplicate,
    contactValid,
  };
}
