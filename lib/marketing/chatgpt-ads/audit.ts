export type ChatgptAudit = {
  clientKey: string;
  actorId: string;
  actorKind: string;
  action: string;
  detail: string;
  at: string;
};

const audits: ChatgptAudit[] = [];

export function recordChatgptAudit(input: Omit<ChatgptAudit, "at">) {
  const detail = input.detail.replace(/\s+/g, " ").trim().slice(0, 400);
  audits.push({ ...input, detail, at: new Date().toISOString() });
}

export function chatgptAudits(clientKey?: string) {
  return audits.filter((row) => !clientKey || row.clientKey === clientKey);
}

export function resetChatgptAudits() {
  audits.length = 0;
}
