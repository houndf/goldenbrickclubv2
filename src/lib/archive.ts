import { legacyAccuracyOffset, legacyPoints } from "./scoring/legacy";

/** Inputs, shaped like the database rows. */
export interface ArchiveMatch {
  id: string;
  kickoffAt: string;
  segment: number;
  home: { code: string; name: string };
  away: { code: string; name: string };
  homeGoals: number;
  awayGoals: number;
}
export interface ArchivePlayer {
  id: number;
  name: string;
  profileId: string | null;
}
export interface ArchivePick {
  matchId: string;
  playerId: number;
  predHome: number;
  predAway: number;
}

export interface StandingRow {
  rank: number;
  playerId: number;
  name: string;
  profileId: string | null;
  points: number;
  offset: number;
  picks: number;
}

export interface SegmentResult {
  number: number;
  matches: number;
  winner: StandingRow | null;
  spoon: StandingRow | null;
}

export type FormResult = "W" | "D" | "L";

export interface ClubRecord {
  team: string;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Newest first. */
  lastFive: FormResult[];
  played: number;
}

/**
 * Old exact-score rules: rank by points, then lowest accuracy offset.
 * Only players with at least one pick in the set are ranked.
 */
export function legacyStandings(
  matches: ArchiveMatch[],
  players: ArchivePlayer[],
  picks: ArchivePick[],
): StandingRow[] {
  const byMatch = new Map(matches.map((m) => [m.id, m]));
  const byPlayer = new Map(players.map((p) => [p.id, p]));
  const totals = new Map<number, { points: number; offset: number; picks: number }>();

  for (const pick of picks) {
    const match = byMatch.get(pick.matchId);
    if (!match || !byPlayer.has(pick.playerId)) continue;
    const t = totals.get(pick.playerId) ?? { points: 0, offset: 0, picks: 0 };
    t.points += legacyPoints(pick.predHome, pick.predAway, match.homeGoals, match.awayGoals);
    t.offset += legacyAccuracyOffset(pick.predHome, pick.predAway, match.homeGoals, match.awayGoals);
    t.picks += 1;
    totals.set(pick.playerId, t);
  }

  const rows = [...totals.entries()]
    .map(([playerId, t]) => {
      const p = byPlayer.get(playerId)!;
      return { playerId, name: p.name, profileId: p.profileId, ...t };
    })
    .sort((a, b) => b.points - a.points || a.offset - b.offset || a.name.localeCompare(b.name));

  let rank = 0;
  return rows.map((row, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.points !== row.points || prev.offset !== row.offset) rank = i + 1;
    return { rank, ...row };
  });
}

export function legacySegments(
  matches: ArchiveMatch[],
  players: ArchivePlayer[],
  picks: ArchivePick[],
): SegmentResult[] {
  const numbers = [...new Set(matches.map((m) => m.segment))].sort((a, b) => a - b);
  return numbers.map((n) => {
    const segMatches = matches.filter((m) => m.segment === n);
    const ids = new Set(segMatches.map((m) => m.id));
    const table = legacyStandings(segMatches, players, picks.filter((p) => ids.has(p.matchId)));
    return {
      number: n,
      matches: segMatches.length,
      winner: table[0] ?? null,
      spoon: table.length > 1 ? table[table.length - 1] : null,
    };
  });
}

export function clubRecord(matches: ArchiveMatch[], teamCode: string): ClubRecord | null {
  const played = matches
    .filter((m) => m.home.code === teamCode || m.away.code === teamCode)
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  if (played.length === 0) return null;

  let wins = 0,
    draws = 0,
    losses = 0,
    goalsFor = 0,
    goalsAgainst = 0;
  const results: FormResult[] = [];
  let teamName = teamCode;
  for (const m of played) {
    const atHome = m.home.code === teamCode;
    teamName = atHome ? m.home.name : m.away.name;
    const gf = atHome ? m.homeGoals : m.awayGoals;
    const ga = atHome ? m.awayGoals : m.homeGoals;
    goalsFor += gf;
    goalsAgainst += ga;
    const r: FormResult = gf > ga ? "W" : gf < ga ? "L" : "D";
    if (r === "W") wins++;
    else if (r === "D") draws++;
    else losses++;
    results.push(r);
  }
  return {
    team: teamName,
    wins,
    draws,
    losses,
    points: wins * 3 + draws,
    goalsFor,
    goalsAgainst,
    lastFive: results.slice(-5).reverse(),
    played: played.length,
  };
}
