import { clientConfig } from "./client-config";
import type { CallOutcomeName, CallStatusName } from "./types";

export function formatDateTime(date: Date | string, timeZone = clientConfig().timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function formatDay(date: Date | string, timeZone = clientConfig().timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatLongDay(iso: string, timeZone = clientConfig().timezone) {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 16, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(utc);
}

export function formatDuration(sec: number) {
  const safe = Math.max(0, Math.round(sec));
  if (safe < 60) return `${safe}s`;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

export function timeAgo(date: Date | string, now = new Date()) {
  const s = Math.round((now.getTime() - new Date(date).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) {
    const m = Math.round(s / 60);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (s < 86400) {
    const h = Math.round(s / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function outcomeLabel(outcome: string | null | undefined) {
  const map: Record<string, string> = {
    callback_requested: "Callback requested",
    booked: "Booked",
    not_interested: "Not interested",
    no_answer: "No answer",
    voicemail: "Voicemail",
    failed: "Failed",
    wrong_number: "Wrong number",
  };
  if (!outcome) return "—";
  return map[outcome] ?? outcome;
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    queued: "Queued",
    dialing: "Dialing",
    in_progress: "In progress",
    wrap_up: "Wrap-up",
    completed: "Completed",
    failed: "Failed",
  };
  return map[status] ?? status;
}

export function outcomeTone(outcome: string | null | undefined): "amber" | "green" | "red" | "gray" {
  if (outcome === "callback_requested" || outcome === "voicemail" || outcome === "no_answer") return "amber";
  if (outcome === "booked") return "green";
  if (outcome === "failed" || outcome === "wrong_number") return "red";
  if (outcome === "not_interested") return "gray";
  return "gray";
}

export function statusTone(status: string): "green" | "red" | "amber" | "blue" | "gray" {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "dialing" || status === "wrap_up") return "amber";
  if (status === "in_progress") return "blue";
  return "gray";
}

export function isTerminal(status: CallStatusName | string) {
  return status === "completed" || status === "failed";
}

export function isConnectedOutcome(outcome: CallOutcomeName | string | null, durationSec: number, status: string) {
  return status === "completed" && durationSec > 0 && outcome !== "failed" && outcome !== "no_answer";
}
