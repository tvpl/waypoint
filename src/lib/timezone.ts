/** Calendar day (YYYY-MM-DD) of an instant in an IANA time zone; falls back to the runtime's zone. */
export function dayInZone(at: Date | number, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  }
}

/** Adds days to a YYYY-MM-DD date (calendar arithmetic, no time zone involved). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayIso = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

export const TZ_COOKIE = "wp_tz";
export const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz) && tz.length <= 64;
  } catch {
    return false;
  }
};
