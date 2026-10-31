export function reseedDue(lastFinishedAt: Date | null, now: Date, timeZone = "America/New_York") {
  if (!lastFinishedAt) return true;
  const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  return day(lastFinishedAt) !== day(now);
}
