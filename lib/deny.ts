import { forbidden } from "next/navigation";

/** Permission failures render as HTTP 403. A thrown Error becomes a 500. */
export function denyAccess(): never {
  forbidden();
}

export function isAccessDenied(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  return String((error as { digest?: unknown }).digest).endsWith(";403");
}
