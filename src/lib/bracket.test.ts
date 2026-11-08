import { describe, expect, it } from "vitest";
import { buildBracket, roundOneSlot } from "./bracket";
import type { TRound, TTie } from "./tournament";

const rounds: TRound[] = ["Wild Card", "Round One", "Conference Semifinals", "Conference Finals", "MLS Cup"].map((name, i) => ({
  id: i + 1,
  number: i + 1,
  name,
  points: i + 1,
  locksAt: null,
  isFinal: i === 4,
}));

let id = 100;
const tie = (roundId: number, label: string | null, a: string, b: string, seedA: number | null, seedB: number | null, extra: Partial<TTie> = {}): TTie => ({
  id: id++,
  roundId,
  slot: id,
  label,
  teamA: { code: a, name: a },
  teamB: { code: b, name: b },
  seedA,
  seedB,
  winner: null,
  totalGoals: null,
  kickoff: null,
  ...extra,
});

const ties: TTie[] = [
  tie(1, "EAST", "ORL", "CIN", 8, 9, { winner: "away" }),
  tie(1, "WEST", "SEA", "RSL", 8, 9),
  tie(2, "EAST", "MIA", "CLB", 2, 7),
  tie(2, "EAST", "NE", "PHI", 3, 6),
  tie(2, "EAST", "CHI", "CLT", 4, 5, { winner: "home" }),
  tie(2, "WEST", "DAL", "POR", 2, 7),
  tie(2, "WEST", "STL", "LAFC", 3, 6),
  tie(2, "WEST", "SJ", "HOU", 4, 5),
];

describe("bracket layout", () => {
  it("slots Round One by seeds", () => {
    expect([ties[2], ties[3], ties[4]].map(roundOneSlot)).toEqual([2, 3, 1]);
    expect(roundOneSlot({ ...ties[2], seedA: 1, seedB: 9 })).toBe(0);
  });

  it("draws a two-sided bracket with East left, West right, the final in the middle", () => {
    const b = buildBracket(rounds, ties, { topSeeds: { EAST: { code: "NSH", name: "Nashville" } } });
    const node = (k: string) => b.nodes.find((n) => n.key === k)!;
    // 2 WC + 8 R1 + 4 SF + 2 CF + final
    expect(b.nodes).toHaveLength(17);
    expect(node("E-wc").x).toBeLessThan(node("E-r1-0").x);
    expect(node("W-wc").x).toBeGreaterThan(node("W-r1-0").x);
    expect(node("final").x).toBeGreaterThan(node("E-cf").x);
    expect(node("final").x).toBeLessThan(node("W-cf").x);
    // Seed order down the column: 1v8/9, 4v5, 2v7, 3v6
    expect(node("E-r1-1").tie?.teamA.code).toBe("CHI");
    expect(node("E-r1-2").tie?.teamA.code).toBe("MIA");
    expect(node("E-r1-3").tie?.teamA.code).toBe("NE");
    // The missing 1-seed game shows the top seed vs the Wild Card winner
    expect(node("E-r1-0").tie).toBeNull();
    expect(node("E-r1-0").placeholder?.a?.code).toBe("NSH");
    expect(node("E-r1-0").placeholder?.b?.code).toBe("CIN");
    expect(node("W-r1-0").placeholder?.b?.code).toBe("WC");
    // Wild card sits level with the 1-seed's game; semis sit between their feeders
    expect(node("E-wc").y).toBe(node("E-r1-0").y);
    expect(node("E-sf-0").y).toBe((node("E-r1-0").y + node("E-r1-1").y) / 2);
    expect(node("E-sf-0").placeholder?.b?.code).toBe("CHI");
    expect(b.edges).toContainEqual({ from: "E-wc", to: "E-r1-0" });
    expect(b.edges).toContainEqual({ from: "W-cf", to: "final" });
  });

  it("places a semifinal by where its teams came from", () => {
    const withSf = [...ties, tie(3, "EAST", "NE", "MIA", 3, 2)];
    const b = buildBracket(rounds, withSf);
    expect(b.nodes.find((n) => n.key === "E-sf-1")?.tie?.teamA.code).toBe("NE");
    expect(b.nodes.find((n) => n.key === "E-sf-0")?.tie).toBeNull();
  });

  it("falls back to simple columns for unlabelled tournaments", () => {
    const simple = [tie(1, null, "A", "B", null, null), tie(1, null, "C", "D", null, null)];
    const b = buildBracket(rounds.slice(0, 2), simple);
    expect(b.edges).toHaveLength(0);
    expect(b.nodes.filter((n) => n.tie)).toHaveLength(2);
    expect(b.nodes.some((n) => n.key === "r2-tbd")).toBe(true);
  });
});
