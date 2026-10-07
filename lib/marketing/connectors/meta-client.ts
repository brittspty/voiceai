import { createHmac } from "node:crypto";
import { asRecord, str } from "./meta-map";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function appSecretProof(accessToken: string, appSecret: string) {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

export function redactSecrets(value: string, secrets: string[] = []) {
  let redacted = value
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/appsecret_proof=[^&\s]+/gi, "appsecret_proof=[redacted]");
  for (const secret of secrets) {
    if (secret.length >= 6) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function graphUrl(input: {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
}) {
  const url = new URL(`https://graph.facebook.com/${input.version}/${input.path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", input.token);
  url.searchParams.set("appsecret_proof", appSecretProof(input.token, input.appSecret));
  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url;
}

export async function graphGet(input: {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = graphUrl(input);
  const secrets = [input.token, input.appSecret];
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta request failed";
    throw new Error(redactSecrets(message, secrets));
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Meta ${response.status}: ${redactSecrets(text, secrets).slice(0, 300)}`);
  }
  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new Error("Meta returned a response that was not JSON");
  }
}

export async function graphList(input: {
  version: string;
  path: string;
  token: string;
  appSecret: string;
  params?: Record<string, string>;
  fetchImpl?: FetchLike;
}) {
  const rows: unknown[] = [];
  let after = "";
  for (let page = 0; page < 50; page += 1) {
    const params: Record<string, string> = { ...(input.params ?? {}), limit: "100" };
    if (after) params.after = after;
    const body = asRecord(
      await graphGet({
        version: input.version,
        path: input.path,
        token: input.token,
        appSecret: input.appSecret,
        params,
        fetchImpl: input.fetchImpl,
      }),
    );
    if (Array.isArray(body.data)) rows.push(...body.data);
    const paging = asRecord(body.paging);
    const cursors = asRecord(paging.cursors);
    const nextAfter = str(cursors.after);
    if (!str(paging.next) || !nextAfter || nextAfter === after) break;
    after = nextAfter;
  }
  return rows;
}
