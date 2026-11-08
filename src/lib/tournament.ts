/**
 * Tournament ("Cup") scoring. Separate from the season:
 * - each correct "who advances" pick scores the round's points (1, 2, 3, …)
 * - wrong or missed picks score 0
 * - ties for the Oracle trophy go to the closest total-goals guess for the final
 */
export type Side = "home" | "away"; // home = team A, away = team B

export interface TRound {
  id: number;
  number: number;
  name: string;
  points: number;
  locksAt: string | null;
  isFinal: boolean;
}

export interface TTeam {
  code: string;
  name: string;
}

export interface TTie {
  id: number;
  roundId: number;
  slot: number;
  label: string | null;
  teamA: TTeam;
  teamB: TTeam;
  seedA: number | null;
  seedB: number | null;
  winner: Side | null;
  totalGoals: number | null;
  /** First kickoff of this matchup, if known. */
  kickoff: string | null;
}

export const LOCK_BEFORE_KICKOFF_MS = 60 * 60_000;

/** Picks lock 1 hour before the matchup's kickoff (or its round's time, if no kickoff is set). */
export function tieLockAt(tie: TTie, round: TRound): string | null {
  const base = tie.kickoff ?? round.locksAt;
  return base ? new Date(Date.parse(base) - LOCK_BEFORE_KICKOFF_MS).toISOString() : null;
}

export type TieState = "tbd" | "open" | "locked" | "done";

export function tieState(tie: TTie, round: TRound, now: Date = new Date()): TieState {
  if (tie.winner) return "done";
  const lock = tieLockAt(tie, round);
  if (!lock) return "tbd";
  return now < new Date(lock) ? "open" : "locked";
}

export interface TPick {
  tieId: number;
  playerId: string;
  pick: Side;
  totalGoals: number | null;
}

export type RoundState = "setup" | "open" | "locked" | "done";

export function roundState(round: TRound, ties: TTie[], now: Date = new Date()): RoundState {
  const mine = ties.filter((t) => t.roundId === round.id);
  if (mine.length > 0 && mine.every((t) => t.winner)) return "done";
  const states = mine.map((t) => tieState(t, round, now));
  if (states.includes("open")) return "open";
  if (states.includes("locked")) return "locked";
  return "setup";
}

export interface TStanding {
  rank: number;
  playerId: string;
  points: number;
  correct: number;
  picks: number;
  /** Points per round number. */
  byRound: Record<number, number>;
  /** |guess − actual| for the final's total goals, once known. */
  tiebreak: number | null;
}

export function tournamentStandings(
  rounds: TRound[],
  ties: TTie[],
  picks: TPick[],
  playerIds: string[],
  nameOf: (id: string) => string = (id) => id,
): TStanding[] {
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const tieById = new Map(ties.map((t) => [t.id, t]));
  const finalRound = rounds.find((r) => r.isFinal);
  const finalTie = finalRound ? ties.find((t) => t.roundId === finalRound.id) : undefined;
  const allowed = new Set(playerIds);

  const rows = new Map<string, TStanding>();
  for (const id of playerIds) {
    rows.set(id, { rank: 0, playerId: id, points: 0, correct: 0, picks: 0, byRound: {}, tiebreak: null });
  }

  for (const p of picks) {
    if (!allowed.has(p.playerId)) continue;
    const tie = tieById.get(p.tieId);
    const round = tie && roundById.get(tie.roundId);
    if (!tie || !round) continue;
    const row = rows.get(p.playerId)!;
    row.picks += 1;
    row.byRound[round.number] ??= 0;
    if (tie.winner && tie.winner === p.pick) {
      row.points += round.points;
      row.correct += 1;
      row.byRound[round.number] += round.points;
    }
    if (finalTie && tie.id === finalTie.id && finalTie.totalGoals != null && p.totalGoals != null) {
      row.tiebreak = Math.abs(p.totalGoals - finalTie.totalGoals);
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      (a.tiebreak ?? Infinity) - (b.tiebreak ?? Infinity) ||
      nameOf(a.playerId).localeCompare(nameOf(b.playerId)),
  );

  let rank = 0;
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.points !== row.points || prev.tiebreak !== row.tiebreak) rank = i + 1;
    row.rank = rank;
  });
  return sorted;
}

/** "MLS Cup Playoffs" preset: 5 rounds worth 1–5 points, the last is the final. */
export const MLS_CUP_PLAYOFF_ROUNDS = [
  "Wild Card",
  "Round One",
  "Conference Semifinals",
  "Conference Finals",
  "MLS Cup",
];
