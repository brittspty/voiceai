import type { Env } from "../config";
import { assertNoAdBudgetWrite } from "../connectors/budget-lock";
import type { HashedIdentifier, MaidIdType } from "./maid";

export const AUDIENCE_PLATFORMS = ["meta", "google_customer_match", "tiktok", "stackadapt", "generic_dsp"] as const;
export type AudiencePlatform = (typeof AUDIENCE_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<AudiencePlatform, string> = {
  meta: "Meta",
  google_customer_match: "Google Customer Match",
  tiktok: "TikTok",
  stackadapt: "StackAdapt",
  generic_dsp: "DSP",
};

export function isAudiencePlatform(value: string): value is AudiencePlatform {
  return (AUDIENCE_PLATFORMS as readonly string[]).includes(value);
}

export type UploadMember = { idType: MaidIdType; hash: string };

const URL_ENV: Record<AudiencePlatform, string> = {
  meta: "AUDIENCE_PUSH_URL_META",
  google_customer_match: "AUDIENCE_PUSH_URL_GOOGLE",
  tiktok: "AUDIENCE_PUSH_URL_TIKTOK",
  stackadapt: "AUDIENCE_PUSH_URL_STACKADAPT",
  generic_dsp: "AUDIENCE_PUSH_URL_DSP",
};

export function platformUploadUrl(platform: AudiencePlatform, env: Env = process.env) {
  const configured = (env[URL_ENV[platform]] || "").trim();
  if (configured.startsWith("https://")) return configured;
  return `dry-run://${platform}/audience-upload`;
}

function column(members: UploadMember[], idType: MaidIdType) {
  return members.filter((member) => member.idType === idType).map((member) => member.hash);
}

export function buildMetaPayload(members: UploadMember[]) {
  const schema = ["MADID", "EMAIL", "PHONE"];
  const rows: string[][] = [];
  for (const member of members) {
    if (member.idType === "idfa" || member.idType === "gaid") rows.push([member.hash, "", ""]);
    else if (member.idType === "email_sha256") rows.push(["", member.hash, ""]);
    else rows.push(["", "", member.hash]);
  }
  return {
    hashing: "sha256",
    payload: { schema, data: rows },
  };
}

export function buildGooglePayload(members: UploadMember[], consentBasis: string) {
  const operations = members.map((member) => {
    if (member.idType === "email_sha256") return { create: { userIdentifiers: [{ hashedEmail: member.hash }] } };
    if (member.idType === "phone_sha256") return { create: { userIdentifiers: [{ hashedPhoneNumber: member.hash }] } };
    return { create: { userIdentifiers: [{ mobileId: member.hash }] } };
  });
  return {
    hashing: "sha256",
    consentBasis,
    job: {
      type: "CUSTOMER_MATCH_USER_LIST",
      customerMatchUserListMetadata: {
        consent: { adUserData: "GRANTED", adPersonalization: "GRANTED" },
      },
    },
    operations,
  };
}

export function buildTikTokPayload(members: UploadMember[]) {
  const schema = ["IDFA_SHA256", "GAID_SHA256", "EMAIL_SHA256", "PHONE_SHA256"];
  const batch = members.map((member) => {
    const row = ["", "", "", ""];
    if (member.idType === "idfa") row[0] = member.hash;
    else if (member.idType === "gaid") row[1] = member.hash;
    else if (member.idType === "email_sha256") row[2] = member.hash;
    else row[3] = member.hash;
    return row;
  });
  return { action: "append", hashing: "sha256", id_schema: schema, batch_data: batch };
}

export function buildStackAdaptPayload(members: UploadMember[]) {
  return {
    hashing: "sha256",
    profiles: members.map((member) => ({
      id_type: member.idType === "gaid" ? "GAID" : member.idType === "idfa" ? "IDFA" : member.idType === "email_sha256" ? "EMAIL" : "PHONE",
      device_id_sha256: member.idType === "idfa" || member.idType === "gaid" ? member.hash : "",
      email_sha256: member.idType === "email_sha256" ? member.hash : "",
      phone_sha256: member.idType === "phone_sha256" ? member.hash : "",
    })),
  };
}

export function buildGenericDspPayload(members: UploadMember[]) {
  return {
    hashing: "sha256",
    identifiers: members.map((member) => ({
      type: member.idType === "email_sha256" || member.idType === "phone_sha256" ? member.idType : "maid_sha256",
      id_type: member.idType,
      value: member.hash,
    })),
  };
}

export function buildPlatformPayload(platform: AudiencePlatform, members: UploadMember[], consentBasis: string) {
  if (platform === "meta") return buildMetaPayload(members);
  if (platform === "google_customer_match") return buildGooglePayload(members, consentBasis);
  if (platform === "tiktok") return buildTikTokPayload(members);
  if (platform === "stackadapt") return buildStackAdaptPayload(members);
  return buildGenericDspPayload(members);
}

export function guardAudiencePayload(platform: AudiencePlatform, payload: unknown, env: Env = process.env) {
  assertNoAdBudgetWrite({ method: "POST", url: platformUploadUrl(platform, env), body: payload });
}

export function manualUploadSteps(platform: AudiencePlatform, listId: string, vendor: string) {
  const who = `List ${listId} from ${vendor}`;
  const shared = [
    `${who}. Upload the hashed file. Do not paste a budget or a bid.`,
    "VoiceOps logs this file. It does not send it unless the live upload switch is on and an https upload URL is set.",
  ];
  if (platform === "meta") {
    return [
      "Open Meta Ads Manager → Audiences → Create audience → Customer list.",
      "Columns are MADID, EMAIL, and PHONE. Every value is SHA-256. MADID is the hash of the uppercase IDFA or lowercase GAID.",
      ...shared,
    ];
  }
  if (platform === "google_customer_match") {
    return [
      "Open Google Ads → Tools → Audience manager → Customer lists → upload a data file.",
      "Mobile IDs, emails, and phones in this file are SHA-256. Consent is granted for ad user data and ad personalization.",
      ...shared,
    ];
  }
  if (platform === "tiktok") {
    return [
      "Open TikTok Ads Manager → Assets → Audiences → Create → Customer file.",
      "Schema columns are IDFA_SHA256, GAID_SHA256, EMAIL_SHA256, and PHONE_SHA256.",
      ...shared,
    ];
  }
  if (platform === "stackadapt") {
    return [
      "Open StackAdapt → Audiences → CRM audience and upload the file.",
      "Device rows use device_id_sha256. Email and phone rows use the matching SHA-256 column.",
      ...shared,
    ];
  }
  return [
    "Open the DSP's CRM or first-party audience upload.",
    "Each row is maid_sha256, email_sha256, or phone_sha256.",
    ...shared,
  ];
}

export function memberCounts(members: UploadMember[]) {
  return {
    madid: column(members, "idfa").length + column(members, "gaid").length,
    email: column(members, "email_sha256").length,
    phone: column(members, "phone_sha256").length,
  };
}

export function asUploadMembers(rows: HashedIdentifier[]): UploadMember[] {
  return rows.map((row) => ({ idType: row.idType, hash: row.hash }));
}
