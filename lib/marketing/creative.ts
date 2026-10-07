import { createHash } from "node:crypto";
import type { PlatformCreativeRef } from "./types";

function norm(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Path only. Query strings (UTMs) are not part of the creative version. */
export function landingPath(url: string) {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/$/, "");
    return path || "/";
  } catch {
    return raw.split("?")[0].trim();
  }
}

export function creativeFingerprint(input: {
  headline: string;
  body: string;
  description: string;
  cta: string;
  mediaRef: string;
  landingUrl: string;
}) {
  const parts = [
    norm(input.headline),
    norm(input.body),
    norm(input.description),
    norm(input.cta),
    norm(input.mediaRef),
    norm(landingPath(input.landingUrl)),
  ];
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/** Strip a trailing team version tag so "Roof storm v2" stays on the same concept. */
export function conceptKey(name: string, mediaRef: string, fingerprint: string) {
  const stripped = norm(name).replace(/\bv\d+$/i, "").trim();
  if (stripped) return `name:${stripped}`;
  if (mediaRef.trim()) return `media:${norm(mediaRef)}`;
  return `fp:${fingerprint.slice(0, 16)}`;
}

export function nextVersionLabel(existing: string[]) {
  let max = 0;
  for (const label of existing) {
    const match = /^v(\d+)$/.exec(label.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `v${max + 1}`;
}

export function mergePlatformCreativeIds(existing: unknown, incoming: PlatformCreativeRef[]) {
  const map = new Map<string, PlatformCreativeRef>();
  const list = Array.isArray(existing) ? existing : [];
  for (const item of [...list, ...incoming]) {
    if (!item || typeof item !== "object") continue;
    const platform = "platform" in item ? String(item.platform || "") : "";
    const externalId = "externalId" in item ? String(item.externalId || "") : "";
    if (!platform || !externalId) continue;
    map.set(`${platform}:${externalId}`, { platform: platform as PlatformCreativeRef["platform"], externalId });
  }
  return [...map.values()];
}
