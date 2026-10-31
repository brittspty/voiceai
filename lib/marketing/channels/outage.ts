export type PauseLog = {
  at: string;
  client: string;
  page: string;
  adIds: string[];
  reason: string;
  actor: "system" | "user";
  result: "dry_run" | "logged_by_hand";
  write: null;
  resume: "pending_confirmation";
};

/** Three failed checks log a dry run. Nothing is paused and nothing auto-resumes. */
export function planOutagePause(input: { failedChecks: number; adIds: string[]; client: string; page: string; at: string }) {
  if (input.failedChecks < 3) {
    return { action: "none" as const, write: null, log: null };
  }
  const log: PauseLog = {
    at: input.at,
    client: input.client,
    page: input.page,
    adIds: input.adIds,
    reason: `${input.failedChecks} failed checks about a minute apart`,
    actor: "system",
    result: "dry_run",
    write: null,
    resume: "pending_confirmation",
  };
  return {
    action: "dry_run" as const,
    write: null,
    wouldPause: input.adIds.length,
    message: `would pause ${input.adIds.length} ads`,
    ui: "Waiting on Jason: ad-account write access",
    resume: "pending_confirmation" as const,
    log,
  };
}

export function logHandPause(input: { client: string; page: string; adIds: string[]; at: string; actorName: string }): PauseLog {
  return {
    at: input.at,
    client: input.client,
    page: input.page,
    adIds: input.adIds,
    reason: `${input.actorName} paused them by hand`,
    actor: "user",
    result: "logged_by_hand",
    write: null,
    resume: "pending_confirmation",
  };
}
