/**
 * Points for the 2027+ pick system. Kept in one place so the league can
 * tweak values without touching the scoring logic.
 */
export const SCORING_RULES = {
  result: {
    /** Correctly calling a home or away win. */
    winCorrect: 3,
    /** Correctly calling a draw (harder, so it pays more). */
    drawCorrect: 5,
    /** Calling the wrong result. */
    wrong: -1,
  },
  margin: {
    /** Bonus for the right winning margin, keyed by the margin picked (3 means "3 or more"). */
    correct: { 1: 2, 2: 3, 3: 4 } as const,
    /** Penalty for a wrong margin, or for any margin bet when the result was wrong. */
    wrong: -2,
  },
  firstGoal: {
    correct: 1,
    wrong: -1,
    /** First-goal bets in a 0–0 are void. */
    void: 0,
  },
} as const;

export type MarginPick = 1 | 2 | 3;
