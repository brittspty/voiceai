import { randomBytes } from "node:crypto";
import type { P1LogStore } from "../../p1-log-store";
import { forReader, type P1Reader } from "../../p1-reader";

export type ScheduleRow = {
  id: string;
  name: string;
  cadence: "Weekly";
  audience: "staff" | "client";
  moneyInCopy: "YES" | "NO";
  exampleData: true;
};

export type DeliveryLog = {
  at: string;
  scheduleId: string;
  audience: "staff" | "client";
  moneyInCopy: "YES" | "NO";
  message: "would send";
  sent: false;
  email: false;
  sms: false;
  push: false;
};

export const EXAMPLE_SCHEDULES: ScheduleRow[] = [
  { id: "ex-client-week", name: "Example client weekly", cadence: "Weekly", audience: "client", moneyInCopy: "NO", exampleData: true },
  { id: "ex-staff-week", name: "Example staff weekly", cadence: "Weekly", audience: "staff", moneyInCopy: "YES", exampleData: true },
];

function seed(): ScheduleRow[] {
  return EXAMPLE_SCHEDULES.map((row) => ({ ...row }));
}

let schedules = seed();
let deliveries: DeliveryLog[] = [];

export function resetSchedules() {
  schedules = seed();
  deliveries = [];
}

export function listDeliveryLog() {
  return deliveries.map((row) => ({ ...row }));
}

export function scheduleCreatedAt(id: string) {
  if (id === "ex-client-week") return new Date("2026-10-01T00:00:00.000Z");
  if (id === "ex-staff-week") return new Date("2026-10-01T00:00:01.000Z");
  return new Date();
}

/** Client rows are always NO, including when a caller asks for YES. */
export function scheduleFromInput(input: { name: string; audience: "staff" | "client"; moneyInCopy?: "YES" | "NO" }, id: string): ScheduleRow | { error: string } {
  const name = input.name.trim();
  if (!name || name.length > 80) return { error: "Name the report." };
  const audience = input.audience === "staff" ? "staff" : "client";
  return {
    id,
    name,
    cadence: "Weekly",
    audience,
    moneyInCopy: audience === "client" ? "NO" : input.moneyInCopy === "NO" ? "NO" : "YES",
    exampleData: true,
  };
}

export function normalizeSchedule(row: ScheduleRow): ScheduleRow {
  const audience = row.audience === "staff" ? "staff" : "client";
  return {
    id: row.id,
    name: row.name,
    cadence: "Weekly",
    audience,
    moneyInCopy: audience === "client" ? "NO" : row.moneyInCopy === "NO" ? "NO" : "YES",
    exampleData: true,
  };
}

export function createSchedule(input: { name: string; audience: "staff" | "client"; moneyInCopy?: "YES" | "NO" }): ScheduleRow | { error: string } {
  const row = scheduleFromInput(input, `ex-${schedules.length + 1}`);
  if ("error" in row) return row;
  schedules = [row, ...schedules];
  return row;
}

export function orderSchedules(rows: ScheduleRow[]) {
  const seeds = new Set(EXAMPLE_SCHEDULES.map((row) => row.id));
  const created = rows.filter((row) => !seeds.has(row.id));
  const seeded = EXAMPLE_SCHEDULES.flatMap((seedRow) => {
    const found = rows.find((row) => row.id === seedRow.id);
    return found ? [found] : [];
  });
  return [...created, ...seeded];
}

/** Reads schedules and fills in the EXAMPLE DATA rows when a workspace does not have them yet. */
export async function loadScheduleRows(store: P1LogStore, workspaceId: string) {
  const current = await store.listSchedules(workspaceId);
  const missing = EXAMPLE_SCHEDULES.filter((seedRow) => !current.some((row) => row.id === seedRow.id));
  for (const seedRow of missing) await store.insertSchedule(workspaceId, seedRow);
  const rows = missing.length === 0 ? current : await store.listSchedules(workspaceId);
  return orderSchedules(rows);
}

export async function createScheduleStored(
  store: P1LogStore,
  workspaceId: string,
  input: { name: string; audience: "staff" | "client"; moneyInCopy?: "YES" | "NO" },
) {
  const row = scheduleFromInput(input, `ex-${randomBytes(6).toString("hex")}`);
  if ("error" in row) return row;
  await store.insertSchedule(workspaceId, row);
  return row;
}

export function presentSchedules(reader: P1Reader, rows: ScheduleRow[] = schedules) {
  const visible = reader === "staff"
    ? rows
    : rows.filter((row) => row.audience === "client").map((row) => ({ ...row, moneyInCopy: "NO" as const }));
  return forReader(
    {
      exampleData: true as const,
      banner: "EXAMPLE DATA",
      rows: visible,
    },
    reader,
  );
}

/**
 * Mock delivery only. Email, SMS, and push are not sent.
 * The log line is exactly "would send".
 */
export function deliveryFor(row: ScheduleRow, now: string): DeliveryLog {
  const normalized = normalizeSchedule(row);
  return {
    at: now,
    scheduleId: normalized.id,
    audience: normalized.audience,
    moneyInCopy: normalized.audience === "client" ? "NO" : normalized.moneyInCopy,
    message: "would send",
    sent: false,
    email: false,
    sms: false,
    push: false,
  };
}

export function normalizeDelivery(row: DeliveryLog): DeliveryLog {
  const audience = row.audience === "staff" ? "staff" : "client";
  return {
    at: row.at,
    scheduleId: row.scheduleId,
    audience,
    moneyInCopy: audience === "client" ? "NO" : row.moneyInCopy === "NO" ? "NO" : "YES",
    message: "would send",
    sent: false,
    email: false,
    sms: false,
    push: false,
  };
}

export function deliverScheduledReport(id: string, now = "2026-10-31T22:00:00.000Z"): DeliveryLog | null {
  const row = schedules.find((item) => item.id === id);
  if (!row) return null;
  const entry = deliveryFor(row, now);
  deliveries = [entry, ...deliveries];
  return entry;
}

export async function deliverScheduleStored(store: P1LogStore, workspaceId: string, id: string, now = "2026-10-31T22:00:00.000Z") {
  const rows = await loadScheduleRows(store, workspaceId);
  const row = rows.find((item) => item.id === id);
  if (!row) return null;
  const entry = deliveryFor(row, now);
  await store.insertDelivery(workspaceId, entry);
  return entry;
}

export function presentDeliveries(reader: P1Reader, rows: DeliveryLog[]) {
  const visible = reader === "staff"
    ? rows.map((row) => normalizeDelivery(row))
    : rows.filter((row) => row.audience === "client").map((row) => normalizeDelivery({ ...row, audience: "client", moneyInCopy: "NO" }));
  return forReader(
    {
      exampleData: true as const,
      banner: "EXAMPLE DATA" as const,
      rows: visible,
    },
    reader,
  );
}
