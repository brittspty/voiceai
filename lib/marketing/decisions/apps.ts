/**
 * Collapse store-page suffixes so the same app is one publisher.
 * "Tubi", "Tubi - Free Movies & TV", and "Tubi: Free Movies & Live TV" are "Tubi".
 */
export function normalizeAppName(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  const head = trimmed.split(/\s*(?:\||:|–|—)\s*|\s+-\s+/)[0] ?? trimmed;
  return head.trim();
}
