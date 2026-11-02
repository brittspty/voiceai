import type { Env } from "../config";
import { audienceDataClientEnabled, audienceDataEnabled, resolutionDataEnabled } from "../config";
import { forSpendViewer } from "../spend-access";
import { canOpenAudienceData, audienceSourceDetail, listAudienceSources, readClientAudienceData } from "./present";
import { readResolution } from "./resolution";

type SpendViewer = { kind: string; role?: string | null; workspaceId?: string | null };

function clientKind(kind: string) {
  return kind === "client_owner" || kind === "client_viewer";
}

export function audienceListBody(input: {
  access: SpendViewer;
  account?: string | null;
  campaign?: string | null;
  search?: string | null;
  env?: Env;
}) {
  const access = input.access;
  const env = input.env;
  if (clientKind(access.kind)) {
    if (!audienceDataClientEnabled(env)) return { status: 404, body: { error: "Off" } };
    const result = readClientAudienceData({
      ownAccountId: access.workspaceId || "",
      requestedAccountId: input.account,
      reader: "client",
      env,
    });
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    return { status: 200, body: forSpendViewer(result.body, access, env) };
  }
  if (!audienceDataEnabled(env)) return { status: 404, body: { error: "Off" } };
  if (!canOpenAudienceData(access.kind)) return { status: 403, body: { error: "Not allowed" } };
  const body = listAudienceSources({
    reader: "staff",
    campaignId: input.campaign || "all",
    search: input.search || "",
    sort: "leads",
    env,
  });
  return { status: 200, body: forSpendViewer(body, access, env) };
}

export function audienceDetailBody(input: {
  access: SpendViewer;
  sourceId: string;
  account?: string | null;
  src?: string | null;
  env?: Env;
}) {
  const access = input.access;
  const env = input.env;
  if (clientKind(access.kind)) {
    if (!audienceDataClientEnabled(env)) return { status: 404, body: { error: "Off" } };
    const result = readClientAudienceData({
      ownAccountId: access.workspaceId || "",
      requestedAccountId: input.account,
      sourceId: input.src || input.sourceId,
      reader: "client",
      env,
    });
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    return { status: 200, body: forSpendViewer(result.body, access, env) };
  }
  if (!audienceDataEnabled(env)) return { status: 404, body: { error: "Off" } };
  if (!canOpenAudienceData(access.kind)) return { status: 403, body: { error: "Not allowed" } };
  const detail = audienceSourceDetail(input.sourceId, "staff", undefined, undefined, undefined, env);
  if (!detail) return { status: 404, body: { error: "Not found" } };
  return { status: 200, body: forSpendViewer(detail, access, env) };
}

export function audienceResolutionBody(input: {
  access: SpendViewer;
  sourceId?: string | null;
  account?: string | null;
  campaign?: string | null;
  src?: string | null;
  env?: Env;
}) {
  const access = input.access;
  const env = input.env;
  if (!resolutionDataEnabled(env)) return { status: 404, body: { error: "Off" } };
  if (clientKind(access.kind)) {
    if (!audienceDataClientEnabled(env)) return { status: 404, body: { error: "Off" } };
    const result = readResolution({
      reader: "client",
      sourceId: input.src || input.sourceId,
      ownAccountId: access.workspaceId || "",
      requestedAccountId: input.account,
      campaignId: input.campaign,
      env,
    });
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    return { status: 200, body: forSpendViewer(result.body, access, env) };
  }
  if (!audienceDataEnabled(env)) return { status: 404, body: { error: "Off" } };
  if (!canOpenAudienceData(access.kind)) return { status: 403, body: { error: "Not allowed" } };
  const result = readResolution({ reader: "staff", sourceId: input.sourceId, campaignId: input.campaign, env });
  if (!result.ok) return { status: result.status, body: { error: result.error } };
  return { status: 200, body: forSpendViewer(result.body, access, env) };
}
