import { SCORING_RULES, type MarginPick } from "./rules";

export type Side = "home" | "away";
export type ResultPick = Side | "draw";

/** What a player locked in for one match. */
export interface Pick {
  result: ResultPick;
  /** Optional "double down": winning margin (3 means 3 or more). Not allowed with a draw. */
  margin?: MarginPick | null;
  /** Optional side bet: which team scores first. */
  firstGoal?: Side | null;
}

/** The final outcome of a match. */
export interface FinalResult {
  home: number;
  away: number;
  /** Team that scored first; null only when the match ended 0–0. */
  firstGoal: Side | null;
}

export interface PickBreakdown {
  result: { correct: boolean; points: number };
  margin: { correct: boolean; points: number } | null;
  firstGoal: { outcome: "correct" | "wrong" | "void"; points: number } | null;
  total: number;
}

export class InvalidPickError extends Error {}
export class InvalidResultError extends Error {}

export function validatePick(pick: Pick): void {
  if (!["home", "away", "draw"].includes(pick.result)) {
    throw new InvalidPickError(`Unknown result pick: ${String(pick.result)}`);
  }
  if (pick.margin != null) {
    if (pick.result === "draw") {
      throw new InvalidPickError("A margin can't be picked with a draw.");
    }
    if (![1, 2, 3].includes(pick.margin)) {
      throw new InvalidPickError(`Margin must be 1, 2 or 3 (3 = 3+), got ${pick.margin}.`);
    }
  }
  if (pick.firstGoal != null && !["home", "away"].includes(pick.firstGoal)) {
    throw new InvalidPickError(`Unknown first-goal pick: ${String(pick.firstGoal)}`);
  }
}

export function validateResult(final: FinalResult): void {
  for (const goals of [final.home, final.away]) {
    if (!Number.isInteger(goals) || goals < 0) {
      throw new InvalidResultError(`Goals must be whole numbers ≥ 0, got ${goals}.`);
    }
  }
  const goalless = final.home === 0 && final.away === 0;
  if (goalless && final.firstGoal !== null) {
    throw new InvalidResultError("A 0–0 match can't have a first goal.");
  }
  if (!goalless && final.firstGoal === null) {
    throw new InvalidResultError("A match with goals needs a first-goal team.");
  }
  if (final.firstGoal === "home" && final.home === 0) {
    throw new InvalidResultError("Home can't have scored first with 0 goals.");
  }
  if (final.firstGoal === "away" && final.away === 0) {
    throw new InvalidResultError("Away can't have scored first with 0 goals.");
  }
}

export function actualResult(final: FinalResult): ResultPick {
  if (final.home > final.away) return "home";
  if (final.away > final.home) return "away";
  return "draw";
}

function marginMatches(picked: MarginPick, actual: number): boolean {
  return picked === 3 ? actual >= 3 : actual === picked;
}

/** Score one pick against a final result. */
export function scorePick(pick: Pick, final: FinalResult): PickBreakdown {
  validatePick(pick);
  validateResult(final);
  const rules = SCORING_RULES;

  const outcome = actualResult(final);
  const resultCorrect = pick.result === outcome;
  const resultPoints = resultCorrect
    ? outcome === "draw"
      ? rules.result.drawCorrect
      : rules.result.winCorrect
    : rules.result.wrong;

  let margin: PickBreakdown["margin"] = null;
  if (pick.margin != null) {
    // The margin only pays when the winner was called correctly.
    const correct =
      resultCorrect && marginMatches(pick.margin, Math.abs(final.home - final.away));
    margin = {
      correct,
      points: correct ? rules.margin.correct[pick.margin] : rules.margin.wrong,
    };
  }

  let firstGoal: PickBreakdown["firstGoal"] = null;
  if (pick.firstGoal != null) {
    if (final.firstGoal === null) {
      firstGoal = { outcome: "void", points: rules.firstGoal.void };
    } else if (pick.firstGoal === final.firstGoal) {
      firstGoal = { outcome: "correct", points: rules.firstGoal.correct };
    } else {
      firstGoal = { outcome: "wrong", points: rules.firstGoal.wrong };
    }
  }

  const total = resultPoints + (margin?.points ?? 0) + (firstGoal?.points ?? 0);
  return { result: { correct: resultCorrect, points: resultPoints }, margin, firstGoal, total };
}

/** Best and worst possible totals for a pick, for the "your ticket" preview. */
export function pickRange(pick: Pick): { best: number; worst: number } {
  validatePick(pick);
  const rules = SCORING_RULES;
  const resultBest = pick.result === "draw" ? rules.result.drawCorrect : rules.result.winCorrect;
  const marginBest = pick.margin != null ? rules.margin.correct[pick.margin] : 0;
  const marginWorst = pick.margin != null ? rules.margin.wrong : 0;
  const firstBest = pick.firstGoal != null ? rules.firstGoal.correct : 0;
  const firstWorst = pick.firstGoal != null ? rules.firstGoal.wrong : 0;
  return {
    best: resultBest + marginBest + firstBest,
    worst: rules.result.wrong + marginWorst + firstWorst,
  };
}
