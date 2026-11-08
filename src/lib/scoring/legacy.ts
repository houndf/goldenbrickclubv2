/**
 * The 2026 exact-score system, used only to rebuild the 2026 archive.
 * Mirrors calculate_points() in the original Streamlit app.
 *
 *  3  exact score
 *  2  right result + one team's score right
 *  1  right result only
 *  0  wrong result + one team's score right
 * -1  wrong result, both scores wrong
 *
 * Tie-breaker ("Accuracy Offset"): |predicted total goals − actual total goals|,
 * summed; lower is better.
 */
export function legacyPoints(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number,
): number {
  if (predHome === actualHome && predAway === actualAway) return 3;
  const sign = (h: number, a: number) => Math.sign(h - a);
  const correctResult = sign(predHome, predAway) === sign(actualHome, actualAway);
  const partial = predHome === actualHome || predAway === actualAway;
  if (correctResult && partial) return 2;
  if (correctResult) return 1;
  if (partial) return 0;
  return -1;
}

export function legacyAccuracyOffset(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number,
): number {
  return Math.abs(predHome + predAway - (actualHome + actualAway));
}
