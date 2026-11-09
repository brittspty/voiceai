import { clarityConnectionOk } from "./connections";

export type ClarityScopeData = {
  projectId: string;
  label: string;
  connectionName: string;
};

/**
 * Fields the mapping helper may write on ClarityClientScope.
 * Live-read flags and every MarketingClient column stay out of this object.
 */
export function clarityScopeData(input: { projectId: string; connection: string; label?: string | null }):
  | { ok: true; data: ClarityScopeData }
  | { ok: false; reason: string } {
  const projectId = input.projectId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/.test(projectId)) return { ok: false, reason: "project id must be the Clarity project id" };
  const connection = input.connection.trim().toLowerCase();
  if (!clarityConnectionOk(connection)) return { ok: false, reason: "connection name must be a short slug from CLARITY_CONNECTIONS" };
  const label = (input.label || "").trim();
  return {
    ok: true,
    data: {
      projectId,
      label: label.length > 120 ? label.slice(0, 120) : label,
      connectionName: connection,
    },
  };
}

/** Heatmaps for one project. The id is checked again so the link cannot leave Clarity. */
export function clarityHeatmapsUrl(projectId: string) {
  const id = projectId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/.test(id)) return "";
  return `https://clarity.microsoft.com/projects/view/${id}/heatmaps`;
}
