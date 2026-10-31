import type { KpiFormat } from "./types";
import { REPORT_MOTION } from "./motion";

export function formatKpi(value: number, format: KpiFormat) {
  if (format === "currency") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (format === "multiple") return `${value.toFixed(1)}×`;
  if (format === "seconds") return `${Math.round(value)}s`;
  if (format === "percent") return `${Math.round(value)}%`;
  if (format === "rating") return value.toFixed(1);
  return Math.round(value).toLocaleString("en-US");
}

export function pointTitle(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const raw = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return raw.replace(",", "");
}

export function formatUpdatedEt(iso: string, now = new Date()) {
  const at = new Date(iso);
  const age = now.getTime() - at.getTime();
  const stale = Number.isFinite(age) && age > REPORT_MOTION.staleMs;
  if (stale) {
    const hours = Math.max(7, Math.round(age / 3_600_000));
    return { stale: true, text: `Updated ${hours}h ago` };
  }
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(at);
  const label = time.replace("EDT", "ET").replace("EST", "ET");
  return { stale: false, text: `updated ${label}` };
}

export function addIsoDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function axisLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
