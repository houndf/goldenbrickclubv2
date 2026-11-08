import { describe, expect, it } from "vitest";
import { easternLocalToIso, isoToEasternLocal, timeUntil } from "./time";

describe("Eastern time helpers", () => {
  it("converts typed Eastern times across daylight saving", () => {
    expect(easternLocalToIso("2026-11-22T15:00")).toBe("2026-11-22T20:00:00.000Z"); // EST
    expect(easternLocalToIso("2026-10-25T15:00")).toBe("2026-10-25T19:00:00.000Z"); // EDT
    expect(easternLocalToIso("nonsense")).toBeNull();
  });

  it("uses the right offset in the early hours of a clock-change day", () => {
    // Clocks fall back at 2:00 AM on Nov 1, 2026: 3:00 AM that day is EST (−5).
    expect(easternLocalToIso("2026-11-01T03:00")).toBe("2026-11-01T08:00:00.000Z");
    // Clocks spring forward at 2:00 AM on Mar 8, 2026: 4:00 AM that day is EDT (−4).
    expect(easternLocalToIso("2026-03-08T04:00")).toBe("2026-03-08T08:00:00.000Z");
    expect(easternLocalToIso("2026-03-08T01:00")).toBe("2026-03-08T06:00:00.000Z");
  });

  it("round-trips for the admin form", () => {
    expect(isoToEasternLocal("2026-11-22T20:00:00.000Z")).toBe("2026-11-22T15:00");
  });

  it("counts down", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    expect(timeUntil("2026-11-21T04:30:00Z", now)).toBe("1d 4h");
    expect(timeUntil("2026-11-20T03:20:00Z", now)).toBe("3h 20m");
    expect(timeUntil("2026-11-19T00:00:00Z", now)).toBe("now");
  });
});
