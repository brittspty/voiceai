import type { ReportQuery, ReportRange } from "./types";

export function parseReportQuery(input: Record<string, string | string[] | undefined>): ReportQuery & { view: "staff" | "client" } {
  const one = (key: string) => {
    const value = input[key];
    return (Array.isArray(value) ? value[0] : value) || "";
  };
  const rangeRaw = one("range");
  const range: ReportRange = rangeRaw === "7d" || rangeRaw === "qtd" || rangeRaw === "custom" ? rangeRaw : "30d";
  const compare = one("compare") === "none" ? "none" : "prior";
  const view = one("view") === "client" ? "client" : "staff";
  return {
    range,
    compare,
    clientId: one("client") || "all",
    view,
    start: one("start") || undefined,
    end: one("end") || undefined,
  };
}

export function reportHref(query: ReportQuery & { view?: "staff" | "client"; share?: boolean }) {
  const params = new URLSearchParams();
  if (query.range !== "30d") params.set("range", query.range);
  if (query.compare === "none") params.set("compare", "none");
  if (query.clientId && query.clientId !== "all") params.set("client", query.clientId);
  if (query.view === "client") params.set("view", "client");
  if (query.range === "custom" && query.start) params.set("start", query.start);
  if (query.range === "custom" && query.end) params.set("end", query.end);
  if (query.share) params.set("share", "open");
  const search = params.toString();
  return search ? `/reports?${search}` : "/reports";
}
