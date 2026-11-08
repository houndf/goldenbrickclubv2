import { describe, expect, it } from "vitest";
import { roundState, tournamentStandings, type TPick, type TRound, type TTie } from "./tournament";

const team = (code: string) => ({ code, name: code });
const rounds: TRound[] = [
  { id: 1, number: 1, name: "Semis", points: 1, locksAt: "2026-11-20T20:00:00Z", isFinal: false },
  { id: 2, number: 2, name: "Final", points: 2, locksAt: "2026-12-05T20:00:00Z", isFinal: true },
];
const ties: TTie[] = [
  { id: 10, roundId: 1, slot: 1, label: null, teamA: team("PHI"), teamB: team("NYC"), seedA: 1, seedB: 4, winner: "home", totalGoals: null },
  { id: 11, roundId: 1, slot: 2, label: null, teamA: team("SD"), teamB: team("SEA"), seedA: 1, seedB: 4, winner: "away", totalGoals: null },
  { id: 20, roundId: 2, slot: 1, label: null, teamA: team("PHI"), teamB: team("SEA"), seedA: null, seedB: null, winner: "home", totalGoals: 3 },
];

describe("tournament scoring", () => {
  it("scores round points for correct picks, 0 for wrong or missed, and never negative", () => {
    const picks: TPick[] = [
      { tieId: 10, playerId: "ana", pick: "home", totalGoals: null }, // +1
      { tieId: 11, playerId: "ana", pick: "home", totalGoals: null }, // 0 (wrong)
      { tieId: 20, playerId: "ana", pick: "home", totalGoals: 2 }, // +2
      { tieId: 10, playerId: "ben", pick: "away", totalGoals: null }, // 0
      // ben missed tie 11 and the final: 0
    ];
    const rows = tournamentStandings(rounds, ties, picks, ["ana", "ben", "cy"]);
    expect(rows.map((r) => [r.rank, r.playerId, r.points, r.correct])).toEqual([
      [1, "ana", 3, 2],
      [2, "ben", 0, 0],
      [2, "cy", 0, 0],
    ]);
    expect(rows[0].byRound).toEqual({ 1: 1, 2: 2 });
  });

  it("breaks a points tie with the closest final total-goals guess", () => {
    const picks: TPick[] = [
      { tieId: 20, playerId: "ana", pick: "home", totalGoals: 5 }, // off by 2
      { tieId: 20, playerId: "ben", pick: "home", totalGoals: 3 }, // exact
    ];
    const rows = tournamentStandings(rounds, ties, picks, ["ana", "ben"]);
    expect(rows.map((r) => [r.rank, r.playerId, r.tiebreak])).toEqual([
      [1, "ben", 0],
      [2, "ana", 2],
    ]);
  });

  it("only ranks the players asked for (gold filter)", () => {
    const picks: TPick[] = [{ tieId: 10, playerId: "ana", pick: "home", totalGoals: null }];
    expect(tournamentStandings(rounds, ties, picks, ["ben"]).map((r) => r.playerId)).toEqual(["ben"]);
  });

  it("knows each round's state", () => {
    const open = { ...rounds[0], id: 3 };
    const openTies = [{ ...ties[0], id: 30, roundId: 3, winner: null }];
    expect(roundState(open, openTies, new Date("2026-11-19T00:00:00Z"))).toBe("open");
    expect(roundState(open, openTies, new Date("2026-11-21T00:00:00Z"))).toBe("locked");
    expect(roundState(rounds[0], ties)).toBe("done");
    expect(roundState({ ...rounds[0], id: 9, locksAt: null }, [])).toBe("setup");
  });
});
