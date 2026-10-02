export type SP = Record<string, string | string[] | undefined>;

export function one(sp: SP, key: string) {
  const value = sp[key];
  return (Array.isArray(value) ? value[0] : value) || "";
}

export function pageOf(sp: SP) {
  const page = Math.max(1, Number(one(sp, "page")) || 1);
  const raw = Number(one(sp, "perPage")) || 20;
  const perPage = raw === 10 || raw === 20 || raw === 50 ? raw : 20;
  return { page, perPage, skip: (page - 1) * perPage };
}

export function queryRecord(sp: SP) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) out[key] = v;
  }
  return out;
}
