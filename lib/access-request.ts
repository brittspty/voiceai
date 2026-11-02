export const ACCESS_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A request inside the window is already sent. An older one can be stored again. */
export function decideAccessRequest(existingAt: Date | null, now: Date) {
  if (!existingAt) return "create" as const;
  const age = now.getTime() - existingAt.getTime();
  if (age >= 0 && age < ACCESS_REQUEST_WINDOW_MS) return "sent" as const;
  return "create" as const;
}

export type AccessRequestDeps = {
  now: Date;
  existingAt: Date | null;
  adminIds: string[];
  create: () => Promise<void>;
  notify: (adminIds: string[]) => Promise<void>;
};

/** Stores one request and notifies staff admins. A repeat inside 24 hours does neither. */
export async function recordPageAccessRequest(deps: AccessRequestDeps) {
  const decision = decideAccessRequest(deps.existingAt, deps.now);
  if (decision === "sent") return { created: false, sent: true };
  await deps.create();
  if (deps.adminIds.length) await deps.notify(deps.adminIds);
  return { created: true, sent: true };
}
