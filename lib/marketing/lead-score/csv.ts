import { classifyLead } from "./classify";
import type { LeadInput, LeadLabel } from "./types";

export type LabeledRow = LeadInput & { id: string; expected: LeadLabel };

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value.trim()));
}

export function parseLabeledCsv(text: string): LabeledRow[] {
  const [header, ...lines] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((key) => key.trim());
  return lines.map((line) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = line[index] ?? "";
    });
    const duration = record.duration_sec.trim();
    const expected = record.expected.trim() as LeadLabel;
    return {
      id: record.id,
      kind: record.kind === "call" ? "call" : "form",
      name: record.name,
      phone: record.phone,
      email: record.email.trim() || null,
      message: record.message,
      transcript: record.transcript,
      durationSec: duration ? Number(duration) : null,
      outcome: record.outcome.trim() || null,
      onDoNotCall: record.on_dnc.trim().toLowerCase() === "true",
      expected,
    };
  });
}

export async function scoreLabeledRows(rows: LabeledRow[]) {
  const results: { id: string; expected: LeadLabel; actual: LeadLabel; reason: string; score: number }[] = [];
  for (const row of rows) {
    const scored = await classifyLead(row, { provider: null });
    results.push({ id: row.id, expected: row.expected, actual: scored.label, reason: scored.reason, score: scored.score });
  }
  const correct = results.filter((row) => row.actual === row.expected).length;
  const byLabel = ["qualified", "unqualified", "spam"] as const;
  const breakdown = byLabel.map((label) => {
    const subset = results.filter((row) => row.expected === label);
    return { label, correct: subset.filter((row) => row.actual === label).length, total: subset.length };
  });
  return {
    total: results.length,
    correct,
    accuracy: results.length ? correct / results.length : 0,
    breakdown,
    misses: results.filter((row) => row.actual !== row.expected),
  };
}
