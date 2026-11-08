/** All league times are US Eastern. */
export const LEAGUE_TZ = "America/New_York";

/** "2026-11-22T15:00" typed in Eastern time → ISO string with the right offset. */
export function easternLocalToIso(local: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, date, time] = m;
  // Find Eastern's offset at that moment. Check twice so times near a clock change
  // (early hours on DST days) use the offset in force then, not 4–5 hours earlier.
  const offsetAt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: LEAGUE_TZ, timeZoneName: "longOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")!
      .value.replace("GMT", "") || "+00:00";
  const first = new Date(`${date}T${time}:00${offsetAt(new Date(`${date}T${time}:00Z`))}`);
  return new Date(`${date}T${time}:00${offsetAt(first)}`).toISOString();
}

/** ISO → "2026-11-22T15:00" in Eastern time, for a datetime-local input. */
export function isoToEasternLocal(iso: string | null): string {
  if (!iso) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: LEAGUE_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** "Sat Nov 22, 3:00 PM" */
export function formatEastern(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: LEAGUE_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "1d 4h", "3h 20m", "12m" until a moment. */
export function timeUntil(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
