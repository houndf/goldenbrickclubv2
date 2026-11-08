import { describe, expect, it } from "vitest";
import { easternLocalToIso, isoToEasternLocal, timeUntil } from "./time";

describe("Eastern time helpers", () => {
  it("converts typed Eastern times across daylight saving", () => {
    expect(easternLocalToIso("2026-11-22T15:00")).toBe("2026-11-22T20:00:00.000Z"); // EST
    expect(easternLocalToIso("2026-10-25T15:00")).toBe("2026-10-25T19:00:00.000Z"); // EDT
    expect(easternLocalToIso("nonsense")).toBeNull();
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
