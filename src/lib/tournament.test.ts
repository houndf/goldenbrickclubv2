import { describe, expect, it } from "vitest";
import { roundState, tieLockAt, tieState, tournamentStandings, type TPick, type TRound, type TTie } from "./tournament";

const team = (code: string) => ({ code, name: code });
const rounds: TRound[] = [
  { id: 1, number: 1, name: "Semis", points: 1, locksAt: "2026-11-20T20:00:00Z", isFinal: false },
  { id: 2, number: 2, name: "Final", points: 2, locksAt: "2026-12-05T20:00:00Z", isFinal: true },
];
const ties: TTie[] = [
  { id: 10, roundId: 1, slot: 1, label: null, teamA: team("PHI"), teamB: team("NYC"), seedA: 1, seedB: 4, winner: "home", totalGoals: null, kickoff: null },
  { id: 11, roundId: 1, slot: 2, label: null, teamA: team("SD"), teamB: team("SEA"), seedA: 1, seedB: 4, winner: "away", totalGoals: null, kickoff: null },
  { id: 20, roundId: 2, slot: 1, label: null, teamA: team("PHI"), teamB: team("SEA"), seedA: null, seedB: null, winner: "home", totalGoals: 3, kickoff: null },
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

  it("knows each round's state (locks 1 hour before kickoff)", () => {
    const open = { ...rounds[0], id: 3 };
    const openTies = [{ ...ties[0], id: 30, roundId: 3, winner: null }];
    expect(roundState(open, openTies, new Date("2026-11-19T00:00:00Z"))).toBe("open");
    expect(roundState(open, openTies, new Date("2026-11-20T19:30:00Z"))).toBe("locked");
    expect(roundState(open, openTies, new Date("2026-11-21T00:00:00Z"))).toBe("locked");
    expect(roundState(rounds[0], ties)).toBe("done");
    expect(roundState({ ...rounds[0], id: 9, locksAt: null }, [])).toBe("setup");
  });
});

describe("matchup locks", () => {
  it("uses the matchup's own kickoff when known, minus an hour", () => {
    const tie = { ...ties[0], winner: null, kickoff: "2026-11-22T20:00:00Z" };
    expect(tieLockAt(tie, rounds[0])).toBe("2026-11-22T19:00:00.000Z");
    expect(tieState(tie, rounds[0], new Date("2026-11-22T18:59:00Z"))).toBe("open");
    expect(tieState(tie, rounds[0], new Date("2026-11-22T19:01:00Z"))).toBe("locked");
  });
  it("is TBD with no kickoff and no round time", () => {
    expect(tieState({ ...ties[0], winner: null }, { ...rounds[0], locksAt: null })).toBe("tbd");
  });
});
