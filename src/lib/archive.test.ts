import { describe, expect, it } from "vitest";
import { clubRecord, legacySegments, legacyStandings, type ArchiveMatch } from "./archive";

const atl = { code: "ATL", name: "Atlanta United" };
const nsh = { code: "NSH", name: "Nashville SC" };
const m = (id: string, seg: number, day: number, home: typeof atl, away: typeof atl, hg: number, ag: number): ArchiveMatch => ({
  id,
  segment: seg,
  kickoffAt: `2026-03-${String(day).padStart(2, "0")}T19:30:00-04:00`,
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
});

const matches = [m("A", 1, 1, atl, nsh, 2, 1), m("B", 1, 8, nsh, atl, 0, 0), m("C", 2, 15, atl, nsh, 0, 3)];
const players = [
  { id: 1, name: "Ana", profileId: "p1" },
  { id: 2, name: "Ben", profileId: null },
  { id: 3, name: "Cy", profileId: null },
];
const picks = [
  { matchId: "A", playerId: 1, predHome: 2, predAway: 1 }, // 3
  { matchId: "B", playerId: 1, predHome: 1, predAway: 1 }, // 1
  { matchId: "A", playerId: 2, predHome: 1, predAway: 0 }, // 1
  { matchId: "B", playerId: 2, predHome: 0, predAway: 0 }, // 3
  { matchId: "C", playerId: 3, predHome: 2, predAway: 1 }, // -1
];

describe("2026 archive", () => {
  it("ranks the season by points, then accuracy offset", () => {
    const rows = legacyStandings(matches, players, picks);
    // Ana and Ben finish level on points and offset, so they share 1st.
    expect(rows.map((r) => [r.rank, r.name, r.points, r.offset])).toEqual([
      [1, "Ana", 4, 2],
      [1, "Ben", 4, 2],
      [3, "Cy", -1, 0],
    ]);
  });

  it("finds segment winners and wooden spoons", () => {
    const segs = legacySegments(matches, players, picks);
    expect(segs[0].matches).toBe(2);
    expect(segs[1].winner?.name).toBe("Cy");
    expect(segs[1].spoon).toBeNull();
  });

  it("builds Atlanta's record from either side of the fixture", () => {
    expect(clubRecord(matches, "ATL")).toMatchObject({
      wins: 1,
      draws: 1,
      losses: 1,
      points: 4,
      goalsFor: 2,
      goalsAgainst: 4,
      lastFive: ["L", "D", "W"],
    });
  });
});
