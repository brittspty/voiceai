export function requestClientMeta(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return { ip, userAgent: headers.get("user-agent") || "unknown" };
}
