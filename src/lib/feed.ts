/**
 * data/feed.json — the results file kept up to date by the scheduled task.
 * The app imports it into the database after each deploy (see feedSync.ts).
 *
 * Team codes are the ones in data/teams.json. Times are ISO 8601 with an
 * offset. "a"/"b" in tournaments mean team A / team B of that matchup.
 */
export type Conference = "east" | "west";
export type MatchStatus = "scheduled" | "live" | "final" | "postponed";

export interface FeedMatch {
  /** Stable id, e.g. "ATL26-01", "ATL27-05". */
  id: string;
  kickoff: string;
  home: string;
  away: string;
  status: MatchStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  /** Team that scored first; null for 0–0 or not known yet. */
  firstGoal: "home" | "away" | null;
}

export interface FeedStanding {
  code: string;
  conference: Conference;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Last five results, newest first, e.g. "WDLLW". */
  form: string;
}

export interface FeedTie {
  /** Stable within the tournament, e.g. "R1-E-1v8". */
  key: string;
  label: string | null;
  teamA: string;
  teamB: string;
  seedA: number | null;
  seedB: number | null;
  /** First kickoff of this matchup; the round locks at its earliest one. */
  firstKickoff: string | null;
  winner: "a" | "b" | null;
  /** Final only: total goals incl. extra time, excluding shootouts. */
  totalGoals: number | null;
}

export interface FeedRound {
  number: number;
  name: string;
  ties: FeedTie[];
}

export interface FeedTournament {
  /** Stable, e.g. "mls-cup-playoffs-2026". */
  key: string;
  name: string;
  trophyName: string;
  status: "live" | "final";
  /** All rounds, first to last; later rounds may have no ties yet. */
  rounds: FeedRound[];
}

export interface Feed {
  /** Bump by 1 on every change; the app re-imports when it goes up. */
  version: number;
  updatedAt: string;
  atlanta: { season: number; matches: FeedMatch[] };
  standings: { season: number; asOf: string | null; teams: FeedStanding[] };
  tournaments: FeedTournament[];
}

const isIso = (s: unknown) => typeof s === "string" && !Number.isNaN(Date.parse(s)) && /T\d{2}:\d{2}/.test(s);
const isGoal = (n: unknown) => n === null || (Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 30);

/** Returns a list of problems; empty means the feed is valid. */
export function validateFeed(feed: Feed, teamCodes: Set<string>): string[] {
  const problems: string[] = [];
  const team = (code: unknown, where: string) => {
    if (typeof code !== "string" || !teamCodes.has(code)) problems.push(`${where}: unknown team code "${String(code)}"`);
  };

  if (!Number.isInteger(feed.version) || feed.version < 1) problems.push("version must be a positive whole number");
  if (!isIso(feed.updatedAt)) problems.push("updatedAt must be an ISO date-time");

  const ids = new Set<string>();
  for (const m of feed.atlanta?.matches ?? []) {
    const where = `match ${m.id}`;
    if (!/^ATL\d{2}-\d{2}$/.test(m.id)) problems.push(`${where}: id must look like ATL27-05`);
    if (ids.has(m.id)) problems.push(`${where}: duplicate id`);
    ids.add(m.id);
    if (!isIso(m.kickoff)) problems.push(`${where}: bad kickoff`);
    team(m.home, where);
    team(m.away, where);
    if (m.home !== "ATL" && m.away !== "ATL") problems.push(`${where}: Atlanta isn't playing`);
    if (!["scheduled", "live", "final", "postponed"].includes(m.status)) problems.push(`${where}: bad status`);
    if (!isGoal(m.homeGoals) || !isGoal(m.awayGoals)) problems.push(`${where}: bad goals`);
    if (m.status === "final") {
      if (m.homeGoals === null || m.awayGoals === null) problems.push(`${where}: final needs both scores`);
      const goals = (m.homeGoals ?? 0) + (m.awayGoals ?? 0);
      if (goals === 0 && m.firstGoal !== null) problems.push(`${where}: 0–0 can't have a first goal`);
      if (m.firstGoal === "home" && m.homeGoals === 0) problems.push(`${where}: home scored first with 0 goals`);
      if (m.firstGoal === "away" && m.awayGoals === 0) problems.push(`${where}: away scored first with 0 goals`);
    }
  }

  for (const s of feed.standings?.teams ?? []) {
    const where = `standing ${s.code}`;
    team(s.code, where);
    if (!["east", "west"].includes(s.conference)) problems.push(`${where}: bad conference`);
    if (s.wins + s.draws + s.losses !== s.played) problems.push(`${where}: W+D+L must equal played`);
    if (s.points !== s.wins * 3 + s.draws) problems.push(`${where}: points must be 3×W + D`);
    if (!/^[WDL]{0,5}$/.test(s.form)) problems.push(`${where}: form must be up to 5 of W/D/L`);
  }

  const tkeys = new Set<string>();
  for (const t of feed.tournaments ?? []) {
    const where = `tournament ${t.key}`;
    if (!/^[a-z0-9-]{3,60}$/.test(t.key)) problems.push(`${where}: key must be lowercase-with-dashes`);
    if (tkeys.has(t.key)) problems.push(`${where}: duplicate key`);
    tkeys.add(t.key);
    if (!t.name || !t.trophyName) problems.push(`${where}: needs name and trophyName`);
    if (!["live", "final"].includes(t.status)) problems.push(`${where}: status must be live or final`);
    t.rounds.forEach((r, i) => {
      if (r.number !== i + 1) problems.push(`${where}: rounds must be numbered 1, 2, 3… in order`);
      const isFinal = i === t.rounds.length - 1;
      const keys = new Set<string>();
      for (const tie of r.ties) {
        const tw = `${where} round ${r.number} tie ${tie.key}`;
        if (keys.has(tie.key)) problems.push(`${tw}: duplicate key`);
        keys.add(tie.key);
        team(tie.teamA, tw);
        team(tie.teamB, tw);
        if (tie.teamA === tie.teamB) problems.push(`${tw}: same team twice`);
        if (tie.firstKickoff !== null && !isIso(tie.firstKickoff)) problems.push(`${tw}: bad firstKickoff`);
        if (tie.winner !== null && tie.winner !== "a" && tie.winner !== "b") problems.push(`${tw}: winner must be a, b or null`);
        if (!isGoal(tie.totalGoals)) problems.push(`${tw}: bad totalGoals`);
        if (!isFinal && tie.totalGoals !== null) problems.push(`${tw}: totalGoals is only for the final`);
      }
    });
    if (t.status === "final") {
      const last = t.rounds[t.rounds.length - 1];
      if (!last || last.ties.length === 0 || last.ties.some((x) => !x.winner)) {
        problems.push(`${where}: a final tournament needs a decided final`);
      }
    }
  }
  return problems;
}
