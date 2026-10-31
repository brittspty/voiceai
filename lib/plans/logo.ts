const MAX_BYTES = 512_000;
const SVG_TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc"]);

export type LogoResult = { ok: true; mime: string; bytes: Uint8Array } | { ok: false; error: string };

function bytesOf(text: string) {
  return new TextEncoder().encode(text);
}

function looksLikeSvg(text: string) {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (trimmed.length > MAX_BYTES) return null;
  if (/<!entity|<!doctype|script|foreignobject|iframe|onload|onerror|javascript:|data:|\shref\s*=|\sxlink:/i.test(trimmed)) return null;
  if (!/^<\?xml[^>]*>\s*<svg[\s>]/i.test(trimmed) && !/^<svg[\s>]/i.test(trimmed)) return null;
  const tags = [...trimmed.matchAll(/<\/?([a-zA-Z0-9:-]+)/g)].map((match) => match[1]?.toLowerCase() || "");
  if (tags.some((tag) => tag && !SVG_TAGS.has(tag))) return null;
  return trimmed;
}

export function sanitizeLogo(bytes: Uint8Array, mime: string): LogoResult {
  if (bytes.byteLength === 0) return { ok: false, error: "Choose a PNG, JPG, or SVG logo." };
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: "Logo must be 500 KB or smaller." };
  const type = mime.trim().toLowerCase();
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((type === "image/png" || type === "image/jpeg" || type === "image/jpg") && (png || jpeg)) {
    const text = new TextDecoder().decode(bytes.slice(0, 64));
    if (/<script|javascript:/i.test(text)) return { ok: false, error: "That file is not a plain PNG or JPG." };
    return { ok: true, mime: png ? "image/png" : "image/jpeg", bytes };
  }
  if (type === "image/svg+xml" || type === "image/svg" || type === "") {
    const svg = looksLikeSvg(new TextDecoder().decode(bytes));
    if (svg) return { ok: true, mime: "image/svg+xml", bytes: bytesOf(svg) };
  }
  return { ok: false, error: "Use a PNG, JPG, or a simple SVG." };
}
