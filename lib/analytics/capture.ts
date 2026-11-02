/** Session replay skips elements with this class or data attribute. */
export const SENSITIVE_CAPTURE_CLASS = "ph-no-capture";
export const SENSITIVE_CAPTURE_ATTRIBUTE = "data-ph-no-capture";

/**
 * Put this class and data-ph-no-capture on containers that show spend, budget,
 * bid, CPx, ROAS, a client name, an email, a phone number, or audience data.
 * Replay blocks the whole subtree. Autocapture also ignores .ph-no-capture.
 */
export function sensitiveCaptureClass(className?: string) {
  if (!className) return SENSITIVE_CAPTURE_CLASS;
  const parts = className.split(/\s+/).filter(Boolean);
  if (parts.includes(SENSITIVE_CAPTURE_CLASS)) return parts.join(" ");
  return `${parts.join(" ")} ${SENSITIVE_CAPTURE_CLASS}`;
}
