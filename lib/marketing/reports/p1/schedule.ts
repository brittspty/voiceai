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

function seed(): ScheduleRow[] {
  return [
    { id: "ex-client-week", name: "Example client weekly", cadence: "Weekly", audience: "client", moneyInCopy: "NO", exampleData: true },
    { id: "ex-staff-week", name: "Example staff weekly", cadence: "Weekly", audience: "staff", moneyInCopy: "YES", exampleData: true },
  ];
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

/** Client rows are always NO, including when a caller asks for YES. */
export function createSchedule(input: { name: string; audience: "staff" | "client"; moneyInCopy?: "YES" | "NO" }): ScheduleRow | { error: string } {
  const name = input.name.trim();
  if (!name || name.length > 80) return { error: "Name the report." };
  const audience = input.audience === "staff" ? "staff" : "client";
  const row: ScheduleRow = {
    id: `ex-${schedules.length + 1}`,
    name,
    cadence: "Weekly",
    audience,
    moneyInCopy: audience === "client" ? "NO" : input.moneyInCopy === "NO" ? "NO" : "YES",
    exampleData: true,
  };
  schedules = [row, ...schedules];
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
export function deliverScheduledReport(id: string, now = "2026-10-31T22:00:00.000Z"): DeliveryLog | null {
  const row = schedules.find((item) => item.id === id);
  if (!row) return null;
  const entry: DeliveryLog = {
    at: now,
    scheduleId: row.id,
    audience: row.audience,
    moneyInCopy: row.audience === "client" ? "NO" : row.moneyInCopy,
    message: "would send",
    sent: false,
    email: false,
    sms: false,
    push: false,
  };
  deliveries = [entry, ...deliveries];
  return entry;
}
