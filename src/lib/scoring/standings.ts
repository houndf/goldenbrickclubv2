import type { PickBreakdown } from "./score";

export interface ScoredPick {
  playerId: string;
  breakdown: PickBreakdown;
}

export interface StandingRow {
  rank: number;
  playerId: string;
  points: number;
  /** Tie-breaker: number of margin bets won. */
  marginWins: number;
  picks: number;
}

/**
 * Rank players by points, then by margin bets won. Players who are still
 * tied share a rank (1, 2, 2, 4…).
 */
export function buildStandings(scored: ScoredPick[], playerIds: string[] = []): StandingRow[] {
  const totals = new Map<string, { points: number; marginWins: number; picks: number }>();
  for (const id of playerIds) totals.set(id, { points: 0, marginWins: 0, picks: 0 });

  for (const { playerId, breakdown } of scored) {
    const row = totals.get(playerId) ?? { points: 0, marginWins: 0, picks: 0 };
    row.points += breakdown.total;
    row.picks += 1;
    if (breakdown.margin?.correct) row.marginWins += 1;
    totals.set(playerId, row);
  }

  const rows = [...totals.entries()]
    .map(([playerId, t]) => ({ playerId, ...t }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.marginWins - a.marginWins ||
        a.playerId.localeCompare(b.playerId),
    );

  let previous: (typeof rows)[number] | undefined;
  let rank = 0;
  return rows.map((row, index) => {
    const tied =
      previous && previous.points === row.points && previous.marginWins === row.marginWins;
    if (!tied) rank = index + 1;
    previous = row;
    return { rank, ...row };
  });
}
