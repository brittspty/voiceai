/** Accepts an app path. Rejects protocol-relative and absolute URLs. */
export function sameOriginPath(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) return fallback;
  return value;
}
