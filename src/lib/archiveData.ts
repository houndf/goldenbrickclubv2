import "server-only";
import { cacheLife } from "next/cache";
import {
  clubRecord,
  legacySegments,
  legacyStandings,
  type ArchiveMatch,
  type ArchivePick,
  type ArchivePlayer,
  type ClubRecord,
  type SegmentResult,
  type StandingRow,
} from "./archive";
import { createSupabasePublicClient } from "./supabase/public";

export interface PlayerLook {
  username: string;
  initials: string;
  color: string;
}

export interface SeasonArchive {
  year: number;
  standings: StandingRow[];
  segments: SegmentResult[];
  club: ClubRecord | null;
  matchCount: number;
  /** Current look (avatar) for 2026 players who now have accounts, by profile id. */
  looks: Record<string, PlayerLook>;
}

interface MatchRow {
  id: string;
  kickoff_at: string;
  home_goals: number;
  away_goals: number;
  segment: { number: number } | null;
  home: { code: string; name: string } | null;
  away: { code: string; name: string } | null;
}

/** A finished exact-score season (2026), computed from the database. Cached for an hour. */
export async function getLegacySeason(year: number): Promise<SeasonArchive | null> {
  "use cache";
  cacheLife("hours");

  const supabase = createSupabasePublicClient();
  if (!supabase) return null;

  const [matchesRes, playersRes, profilesRes] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, kickoff_at, home_goals, away_goals, segment:segments(number), home:teams!matches_home_team_id_fkey(code, name), away:teams!matches_away_team_id_fkey(code, name)",
      )
      .eq("season_id", year)
      .eq("status", "final"),
    supabase.from("legacy_players").select("id, name, profile_id"),
    supabase.from("profiles").select("id, username, initials, avatar_color"),
  ]);
  if (matchesRes.error || playersRes.error) {
    console.error("getLegacySeason failed", matchesRes.error ?? playersRes.error);
    return null;
  }

  const matches: ArchiveMatch[] = (matchesRes.data as unknown as MatchRow[]).map((m) => ({
    id: m.id,
    kickoffAt: m.kickoff_at,
    segment: m.segment?.number ?? 0,
    home: m.home ?? { code: "?", name: "?" },
    away: m.away ?? { code: "?", name: "?" },
    homeGoals: m.home_goals,
    awayGoals: m.away_goals,
  }));
  if (matches.length === 0) return null;

  const picksRes = await supabase
    .from("legacy_picks")
    .select("match_id, legacy_player_id, pred_home, pred_away")
    .in(
      "match_id",
      matches.map((m) => m.id),
    );
  if (picksRes.error) {
    console.error("getLegacySeason picks failed", picksRes.error);
    return null;
  }

  const players: ArchivePlayer[] = (playersRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    profileId: p.profile_id,
  }));
  const picks: ArchivePick[] = (picksRes.data ?? []).map((p) => ({
    matchId: p.match_id,
    playerId: p.legacy_player_id,
    predHome: p.pred_home,
    predAway: p.pred_away,
  }));

  const looks: Record<string, PlayerLook> = {};
  for (const p of profilesRes.data ?? []) {
    looks[p.id] = { username: p.username, initials: p.initials, color: p.avatar_color };
  }

  return {
    year,
    standings: legacyStandings(matches, players, picks),
    segments: legacySegments(matches, players, picks),
    club: clubRecord(matches, "ATL"),
    matchCount: matches.length,
    looks,
  };
}
