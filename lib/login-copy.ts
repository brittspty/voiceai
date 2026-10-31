import { BRAND_WORDMARK } from "./brand";

/** Shown on /login?audience=team. The sign-in itself is unchanged. */
export function loginHeading(audience: string | null | undefined, wordmark = BRAND_WORDMARK) {
  if (audience === "team") return `${wordmark} team sign-in`;
  return `Sign in to ${wordmark}`;
}
