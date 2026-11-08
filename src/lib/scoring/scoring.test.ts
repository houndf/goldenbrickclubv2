import { describe, expect, it } from "vitest";
import {
  InvalidPickError,
  InvalidResultError,
  pickRange,
  scorePick,
  type FinalResult,
  type Pick,
} from "./score";
import { buildStandings } from "./standings";
import { legacyAccuracyOffset, legacyPoints } from "./legacy";

const result = (home: number, away: number, firstGoal: FinalResult["firstGoal"]): FinalResult => ({
  home,
  away,
  firstGoal,
});

describe("result pick", () => {
  it("pays +3 for a correct home or away win", () => {
    expect(scorePick({ result: "home" }, result(2, 0, "home")).total).toBe(3);
    expect(scorePick({ result: "away" }, result(0, 1, "away")).total).toBe(3);
  });

  it("pays +5 for a correct draw", () => {
    expect(scorePick({ result: "draw" }, result(1, 1, "home")).total).toBe(5);
    expect(scorePick({ result: "draw" }, result(0, 0, null)).total).toBe(5);
  });

  it("costs −1 for a wrong result, including a win pick that ends in a draw", () => {
    expect(scorePick({ result: "home" }, result(0, 2, "away")).total).toBe(-1);
    expect(scorePick({ result: "home" }, result(1, 1, "away")).total).toBe(-1);
    expect(scorePick({ result: "draw" }, result(2, 1, "home")).total).toBe(-1);
  });
});

describe("margin double-down (Zee picks Atlanta, at home, to win by 1)", () => {
  const zee: Pick = { result: "home", margin: 1 };

  it("Atlanta win by 1 → +3 +2 = +5", () => {
    expect(scorePick(zee, result(2, 1, "home")).total).toBe(5);
  });
  it("Atlanta win by 2 → +3 −2 = +1", () => {
    expect(scorePick(zee, result(3, 1, "home")).total).toBe(1);
  });
  it("Atlanta lose by 1 → −1 −2 = −3 (margin only pays when the winner is right)", () => {
    const b = scorePick(zee, result(1, 2, "away"));
    expect(b.margin).toEqual({ correct: false, points: -2 });
    expect(b.total).toBe(-3);
  });
  it("Atlanta lose by 2 → −1 −2 = −3", () => {
    expect(scorePick(zee, result(0, 2, "away")).total).toBe(-3);
  });
  it("Atlanta draw → −1 −2 = −3", () => {
    expect(scorePick(zee, result(1, 1, "home")).total).toBe(-3);
  });

  it("scales the bonus: by 2 → +3, by 3+ → +4", () => {
    expect(scorePick({ result: "home", margin: 2 }, result(3, 1, "home")).total).toBe(6);
    expect(scorePick({ result: "home", margin: 3 }, result(3, 0, "home")).total).toBe(7);
    expect(scorePick({ result: "home", margin: 3 }, result(5, 1, "away")).total).toBe(7);
    expect(scorePick({ result: "home", margin: 3 }, result(2, 0, "home")).total).toBe(1);
  });

  it("rejects a margin on a draw pick", () => {
    expect(() => scorePick({ result: "draw", margin: 1 }, result(1, 1, "home"))).toThrow(
      InvalidPickError,
    );
  });
});

describe("first-goal side bet", () => {
  it("is +1 when right and −1 when wrong, independent of the result pick", () => {
    expect(scorePick({ result: "home", firstGoal: "away" }, result(2, 1, "away")).total).toBe(4);
    expect(scorePick({ result: "home", firstGoal: "away" }, result(2, 1, "home")).total).toBe(2);
    expect(scorePick({ result: "away", firstGoal: "home" }, result(2, 1, "home")).total).toBe(0);
  });

  it("is void (0) in a 0–0", () => {
    const b = scorePick({ result: "draw", firstGoal: "home" }, result(0, 0, null));
    expect(b.firstGoal).toEqual({ outcome: "void", points: 0 });
    expect(b.total).toBe(5);
  });

  it("stacks with everything else", () => {
    // Right result, right margin, right first goal: 3 + 2 + 1
    expect(
      scorePick({ result: "home", margin: 1, firstGoal: "home" }, result(2, 1, "home")).total,
    ).toBe(6);
    // Everything wrong: −1 −2 −1
    expect(
      scorePick({ result: "home", margin: 1, firstGoal: "home" }, result(0, 2, "away")).total,
    ).toBe(-4);
  });
});

describe("result validation", () => {
  it("requires a first-goal team when there were goals, and none for 0–0", () => {
    expect(() => scorePick({ result: "home" }, result(1, 0, null))).toThrow(InvalidResultError);
    expect(() => scorePick({ result: "draw" }, result(0, 0, "home"))).toThrow(InvalidResultError);
    expect(() => scorePick({ result: "home" }, result(1, 0, "away"))).toThrow(InvalidResultError);
  });
});

describe("ticket preview range", () => {
  it("matches the mockup: win by 1 + first goal → best +6, worst −4", () => {
    expect(pickRange({ result: "home", margin: 1, firstGoal: "home" })).toEqual({
      best: 6,
      worst: -4,
    });
  });
  it("safe draw → best +5, worst −1", () => {
    expect(pickRange({ result: "draw" })).toEqual({ best: 5, worst: -1 });
  });
});

describe("standings", () => {
  it("sorts by points, breaks ties on margin bets won, and shares a rank when still tied", () => {
    const final = result(2, 1, "home");
    const rows = buildStandings(
      [
        { playerId: "ana", breakdown: scorePick({ result: "home", margin: 1 }, final) }, // 5, 1 margin win
        { playerId: "ben", breakdown: scorePick({ result: "draw" }, result(1, 1, "away")) }, // 5, 0
        { playerId: "cy", breakdown: scorePick({ result: "home" }, final) }, // 3
        { playerId: "dee", breakdown: scorePick({ result: "home" }, final) }, // 3
      ],
      ["ana", "ben", "cy", "dee", "eli"],
    );
    expect(rows.map((r) => [r.rank, r.playerId, r.points, r.marginWins])).toEqual([
      [1, "ana", 5, 1],
      [2, "ben", 5, 0],
      [3, "cy", 3, 0],
      [3, "dee", 3, 0],
      [5, "eli", 0, 0],
    ]);
  });
});

describe("legacy 2026 scoring", () => {
  it("matches the original app's rules", () => {
    expect(legacyPoints(2, 1, 2, 1)).toBe(3);
    expect(legacyPoints(2, 0, 2, 1)).toBe(2);
    expect(legacyPoints(3, 0, 2, 1)).toBe(1);
    expect(legacyPoints(1, 1, 2, 1)).toBe(0);
    expect(legacyPoints(0, 2, 2, 1)).toBe(-1);
    expect(legacyAccuracyOffset(2, 2, 3, 0)).toBe(1);
  });
});
