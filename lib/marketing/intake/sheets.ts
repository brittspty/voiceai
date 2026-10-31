import type { Env } from "../config";
import { googleOAuthStartUrl } from "../offline/access";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** Reuses the Google OAuth client. The scope is Sheets, not Ads. */
export function sheetsOAuthStartUrl(env: Env, redirectUri: string, state: string) {
  return googleOAuthStartUrl(env, redirectUri, state, SHEETS_SCOPE);
}

export function parseSheetGrid(values: string[][]) {
  const headers = (values[0] ?? []).map((cell) => cell.trim());
  const rows = values.slice(1).map((row) => headers.map((_, index) => (row[index] ?? "").trim()));
  return { headers, rows };
}
