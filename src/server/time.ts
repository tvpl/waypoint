import "server-only";
import { cookies } from "next/headers";
import { dayInZone, isTimeZone, TZ_COOKIE } from "@/lib/timezone";

/** The browser's time zone (set by <TimeZoneCookie />), or null before the first visit sets it. */
export async function requestTimeZone(): Promise<string | null> {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return tz && isTimeZone(tz) ? tz : null;
}

/** Today in the person's time zone (the server's on the very first request). */
export async function requestToday(): Promise<string> {
  return dayInZone(new Date(), await requestTimeZone());
}
