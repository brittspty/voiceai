export type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: Math.max(0, WEEKDAYS.indexOf(map.weekday)),
  };
}

export function zonedISODate(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Interpret a wall-clock time in `timeZone` as a UTC instant. */
export function zonedTimeToUtc(wall: string, timeZone: string): Date {
  const normalized = wall.length === 16 ? `${wall}:00` : wall;
  const guess = new Date(`${normalized}Z`);
  const parts = zonedParts(guess, timeZone);
  const asZone = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = asZone - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function zonedDayBounds(now: Date, timeZone: string) {
  const iso = zonedISODate(now, timeZone);
  const start = zonedTimeToUtc(`${iso}T00:00:00`, timeZone);
  const end = zonedTimeToUtc(`${addDaysISO(iso, 1)}T00:00:00`, timeZone);
  return { start, end, iso };
}

export function startOfWeekMonday(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  const offset = (p.weekday + 6) % 7;
  return addDaysISO(zonedISODate(date, timeZone), -offset);
}

export function parseHHMM(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function withinWindow(parts: ZonedParts, start: string, end: string, days: number[]) {
  if (!days.includes(parts.weekday)) return false;
  const cur = parts.hour * 60 + parts.minute;
  const a = parseHHMM(start);
  const b = parseHHMM(end);
  if (a === b) return true;
  if (a < b) return cur >= a && cur < b;
  return cur >= a || cur < b;
}

export function formatHHMM(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function weekdayName(weekday: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday] ?? "Day";
}
