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
  extraGold: boolean;
}

interface SeasonData {
  year: number;
  matches: ArchiveMatch[];
  players: ArchivePlayer[];
  picks: ArchivePick[];
  looks: Record<string, PlayerLook>;
}

export interface SeasonArchive {
  year: number;
  standings: StandingRow[];
  segments: SegmentResult[];
  club: ClubRecord | null;
  matchCount: number;
  /** Current look (avatar) for 2026 players who now have accounts, by profile id. */
  looks: Record<string, PlayerLook>;
  goldOnly: boolean;
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

/** Raw rows for a finished exact-score season (2026). Cached for an hour. */
async function getLegacySeasonData(year: number): Promise<SeasonData | null> {
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
    supabase.from("profiles").select("id, username, initials, avatar_color, extra_gold"),
  ]);
  if (matchesRes.error || playersRes.error) {
    console.error("getLegacySeasonData failed", matchesRes.error ?? playersRes.error);
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
    console.error("getLegacySeasonData picks failed", picksRes.error);
    return null;
  }

  const looks: Record<string, PlayerLook> = {};
  for (const p of profilesRes.data ?? []) {
    looks[p.id] = { username: p.username, initials: p.initials, color: p.avatar_color, extraGold: p.extra_gold };
  }

  return {
    year,
    matches,
    players: (playersRes.data ?? []).map((p) => ({ id: p.id, name: p.name, profileId: p.profile_id })),
    picks: (picksRes.data ?? []).map((p) => ({
      matchId: p.match_id,
      playerId: p.legacy_player_id,
      predHome: p.pred_home,
      predAway: p.pred_away,
    })),
    looks,
  };
}

/**
 * Standings, segment trophies and Atlanta's record for a past season.
 * With goldOnly, only Extra Gold members are ranked (as if no one else played).
 */
export async function getLegacySeason(
  year: number,
  { goldOnly = false }: { goldOnly?: boolean } = {},
): Promise<SeasonArchive | null> {
  const data = await getLegacySeasonData(year);
  if (!data) return null;

  const players = goldOnly
    ? data.players.filter((p) => p.profileId && data.looks[p.profileId]?.extraGold)
    : data.players;

  return {
    year,
    standings: legacyStandings(data.matches, players, data.picks),
    segments: legacySegments(data.matches, players, data.picks),
    club: clubRecord(data.matches, "ATL"),
    matchCount: data.matches.length,
    looks: data.looks,
    goldOnly,
  };
}
