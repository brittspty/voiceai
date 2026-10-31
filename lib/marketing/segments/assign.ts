import { createHash } from "node:crypto";

/** Deterministic fair split. The same id always lands in the same arm. */
export function assignArm(subjectId: string, salt: string, armKeys: string[]) {
  if (!armKeys.length) throw new Error("A test needs at least one arm.");
  const digest = createHash("sha256").update(`${salt}\0${subjectId}`).digest();
  const n = digest.readUInt32BE(0);
  return armKeys[n % armKeys.length]!;
}

export function assignmentCounts(ids: string[], salt: string, armKeys: string[]) {
  const counts = new Map(armKeys.map((key) => [key, 0]));
  for (const id of ids) {
    const arm = assignArm(id, salt, armKeys);
    counts.set(arm, (counts.get(arm) ?? 0) + 1);
  }
  return counts;
}
