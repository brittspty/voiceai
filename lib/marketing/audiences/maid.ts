import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { hashEmailForMeta, hashPhoneForMeta, sha256Hex } from "../offline/hash";

export const MAID_ID_TYPES = ["idfa", "gaid", "email_sha256", "phone_sha256"] as const;
export type MaidIdType = (typeof MAID_ID_TYPES)[number];

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export type HashedIdentifier = {
  idType: MaidIdType;
  hash: string;
  rawEncrypted: string | null;
};

export function isSha256Hex(value: string) {
  return SHA256_HEX.test(value.trim().toLowerCase());
}

/** IDFA is uppercase. GAID is lowercase. The nil UUID is not an identifier. */
export function normalizeMaid(raw: string, idType: "idfa" | "gaid") {
  const trimmed = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
  if (!UUID.test(trimmed)) return null;
  const canonical = idType === "idfa" ? trimmed.toUpperCase() : trimmed.toLowerCase();
  if (canonical.toLowerCase() === NIL_UUID) return null;
  return canonical;
}

export function hashMaid(normalized: string) {
  return sha256Hex(normalized);
}

export function hashEmailIdentifier(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isSha256Hex(trimmed)) return trimmed.toLowerCase();
  const hashed = hashEmailForMeta(trimmed);
  return hashed || null;
}

export function hashPhoneIdentifier(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isSha256Hex(trimmed)) return trimmed.toLowerCase();
  const hashed = hashPhoneForMeta(trimmed);
  return hashed || null;
}

export function maidKeyBytes(raw: string | undefined) {
  const value = (raw || "").trim();
  if (!value) return null;
  if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, "hex");
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    return null;
  }
  return null;
}

export function encryptMaid(plain: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${data.toString("base64url")}`;
}

export function decryptMaid(payload: string, key: Buffer) {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Encrypted MAID is unreadable.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function dedupeKey(idType: MaidIdType, hash: string) {
  return `${idType}:${hash}`;
}

export function dedupeIdentifiers(rows: HashedIdentifier[]) {
  const seen = new Set<string>();
  const unique: HashedIdentifier[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const key = dedupeKey(row.idType, row.hash);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  return { unique, duplicates };
}

/** Logs and payloads must not carry a raw advertising id. */
export function redactMaids(text: string) {
  return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, "[maid]");
}
