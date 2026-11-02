import { money } from "./staff-money";

export type CompareSource = {
  id: string;
  name: string;
  managerName: string | null;
  spend: number | null;
  leads: number;
  booked: number;
  junkAlert: boolean;
  openDecisions: number;
};

export type CompareTableRow = {
  id: string;
  name: string;
  manager: string;
  managerMissing: boolean;
  spend: number | null;
  spendLabel: string;
  leads: number;
  booked: number;
  cpl: number | null;
  cplLabel: string;
  junkAlert: boolean;
  junkLabel: string;
  openDecisions: number;
};

export type CompareQuery = {
  q?: string;
  manager?: string;
  alerts?: boolean;
  decisions?: boolean;
  sort?: string;
  dir?: "asc" | "desc";
};

const SORTS = new Set(["client", "manager", "spend", "leads", "booked", "cpl", "junk", "decisions"]);

export function assembleCompareSources(input: {
  workspaces: { id: string; name: string }[];
  managers: { workspaceId: string; name: string }[];
  metrics: { workspaceId: string; spend: number | null; leads: number; booked: number }[];
  alertWorkspaceIds: string[];
  decisionCounts: { workspaceId: string; count: number }[];
}): CompareSource[] {
  const managers = new Map<string, string[]>();
  for (const row of input.managers) {
    const name = row.name.trim();
    if (!name) continue;
    const list = managers.get(row.workspaceId) || [];
    if (!list.includes(name)) list.push(name);
    managers.set(row.workspaceId, list);
  }
  const metrics = new Map(input.metrics.map((row) => [row.workspaceId, row]));
  const alerts = new Set(input.alertWorkspaceIds);
  const decisions = new Map(input.decisionCounts.map((row) => [row.workspaceId, row.count]));
  return input.workspaces.map((workspace) => {
    const names = managers.get(workspace.id) || [];
    const metric = metrics.get(workspace.id);
    return {
      id: workspace.id,
      name: workspace.name,
      managerName: names.length ? names.join(", ") : null,
      spend: metric && metric.spend != null && Number.isFinite(metric.spend) ? metric.spend : null,
      leads: metric?.leads ?? 0,
      booked: metric?.booked ?? 0,
      junkAlert: alerts.has(workspace.id),
      openDecisions: decisions.get(workspace.id) ?? 0,
    };
  });
}

function rowOf(source: CompareSource): CompareTableRow {
  const cpl = source.spend != null && source.leads > 0 ? source.spend / source.leads : null;
  return {
    id: source.id,
    name: source.name,
    manager: source.managerName || "No manager",
    managerMissing: !source.managerName,
    spend: source.spend,
    spendLabel: money(source.spend),
    leads: source.leads,
    booked: source.booked,
    cpl,
    cplLabel: money(cpl),
    junkAlert: source.junkAlert,
    junkLabel: source.junkAlert ? "Yes" : "No",
    openDecisions: source.openDecisions,
  };
}

function sortValue(row: CompareTableRow, sort: string): number | string | null {
  if (sort === "client") return row.name.toLowerCase();
  if (sort === "manager") return row.manager.toLowerCase();
  if (sort === "spend") return row.spend;
  if (sort === "leads") return row.leads;
  if (sort === "booked") return row.booked;
  if (sort === "cpl") return row.cpl;
  if (sort === "junk") return row.junkAlert ? 1 : 0;
  return row.openDecisions;
}

export function compareTable(sources: CompareSource[], query: CompareQuery = {}) {
  const sort = SORTS.has(query.sort || "") ? query.sort! : "spend";
  const dir = query.dir === "asc" ? "asc" : "desc";
  const q = (query.q || "").trim().toLowerCase();
  const manager = (query.manager || "").trim();
  let rows = sources.map(rowOf);
  if (q) rows = rows.filter((row) => row.name.toLowerCase().includes(q));
  if (manager === "No manager") rows = rows.filter((row) => row.managerMissing);
  else if (manager) rows = rows.filter((row) => row.manager === manager);
  if (query.alerts) rows = rows.filter((row) => row.junkAlert);
  if (query.decisions) rows = rows.filter((row) => row.openDecisions > 0);
  rows.sort((a, b) => {
    const left = sortValue(a, sort);
    const right = sortValue(b, sort);
    if (left == null && right == null) return a.name.localeCompare(b.name);
    if (left == null) return 1;
    if (right == null) return -1;
    const cmp = typeof left === "string" || typeof right === "string" ? String(left).localeCompare(String(right)) : left - right;
    if (cmp === 0) return a.name.localeCompare(b.name);
    return dir === "asc" ? cmp : -cmp;
  });
  const managers = [...new Set(sources.map((row) => row.managerName || "No manager"))].sort((a, b) => a.localeCompare(b));
  return { rows, sort, dir, managers, emptyWorkspace: sources.length === 0 };
}
