export function textField(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
}

export function emailsOfLoose(...values: unknown[]) {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const email = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails.slice(0, 5);
}

export function httpsText(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return "";
    return url.toString().slice(0, 500);
  } catch {
    return "";
  }
}
