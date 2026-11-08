import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "./supabase/public";
import { createSupabaseServerClient } from "./supabase/server";
import type { TPick, TRound, TTie } from "./tournament";

export const TOURNAMENTS_TAG = "tournaments";

export interface TournamentMeta {
  id: number;
  name: string;
  trophyName: string;
  status: "setup" | "live" | "final";
  oracleProfileId: string | null;
  finishedAt: string | null;
}

interface TournamentRow {
  id: number;
  name: string;
  trophy_name: string;
  status: TournamentMeta["status"];
  oracle_profile_id: string | null;
  finished_at: string | null;
}

const toMeta = (t: TournamentRow): TournamentMeta => ({
  id: t.id,
  name: t.name,
  trophyName: t.trophy_name,
  status: t.status,
  oracleProfileId: t.oracle_profile_id,
  finishedAt: t.finished_at,
});

/** All tournaments, newest first. Cached; refreshed when an admin changes one. */
export async function getTournaments(): Promise<TournamentMeta[]> {
  "use cache";
  cacheTag(TOURNAMENTS_TAG);
  cacheLife("hours");
  const supabase = createSupabasePublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, trophy_name, status, oracle_profile_id, finished_at")
    .order("created_at", { ascending: false });
  if (error) {
    // Before the tournaments migration runs there's simply nothing to show.
    console.error("getTournaments failed", error.message);
    return [];
  }
  return (data as TournamentRow[]).map(toMeta);
}

export async function getLiveTournament(): Promise<TournamentMeta | null> {
  return (await getTournaments()).find((t) => t.status === "live") ?? null;
}

/** Trophy names won, by profile id — for the 🔮 Oracle badge. */
export async function getOracleWins(): Promise<Record<string, string[]>> {
  const wins: Record<string, string[]> = {};
  for (const t of await getTournaments()) {
    if (t.status === "final" && t.oracleProfileId) {
      (wins[t.oracleProfileId] ??= []).push(t.trophyName);
    }
  }
  return wins;
}

interface TieRow {
  id: number;
  round_id: number;
  slot: number;
  label: string | null;
  seed_a: number | null;
  seed_b: number | null;
  winner: "home" | "away" | null;
  total_goals: number | null;
  team_a: { code: string; name: string } | null;
  team_b: { code: string; name: string } | null;
}

export interface TournamentDetail {
  meta: TournamentMeta;
  rounds: TRound[];
  ties: TTie[];
  /** Picks this viewer may see: their own, and everyone's once a round locks. */
  picks: TPick[];
}

/** Rounds, matchups and visible picks for one tournament, as the signed-in player. */
export async function getTournamentDetail(id: number): Promise<TournamentDetail | null> {
  const meta = (await getTournaments()).find((t) => t.id === id);
  if (!meta) return null;

  const supabase = await createSupabaseServerClient();
  const { data: roundRows } = await supabase
    .from("tournament_rounds")
    .select("id, number, name, points, locks_at, is_final")
    .eq("tournament_id", id)
    .order("number");
  const rounds: TRound[] = (roundRows ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    name: r.name,
    points: r.points,
    locksAt: r.locks_at,
    isFinal: r.is_final,
  }));
  const roundIds = rounds.map((r) => r.id);
  if (roundIds.length === 0) return { meta, rounds, ties: [], picks: [] };

  const { data: tieRows } = await supabase
    .from("tournament_ties")
    .select(
      "id, round_id, slot, label, seed_a, seed_b, winner, total_goals, team_a:teams!tournament_ties_team_a_id_fkey(code, name), team_b:teams!tournament_ties_team_b_id_fkey(code, name)",
    )
    .in("round_id", roundIds)
    .order("slot");
  const ties: TTie[] = ((tieRows ?? []) as unknown as TieRow[]).map((t) => ({
    id: t.id,
    roundId: t.round_id,
    slot: t.slot,
    label: t.label,
    teamA: t.team_a ?? { code: "?", name: "?" },
    teamB: t.team_b ?? { code: "?", name: "?" },
    seedA: t.seed_a,
    seedB: t.seed_b,
    winner: t.winner,
    totalGoals: t.total_goals,
  }));

  const tieIds = ties.map((t) => t.id);
  const { data: pickRows } = tieIds.length
    ? await supabase.from("tournament_picks").select("tie_id, player_id, pick, total_goals").in("tie_id", tieIds)
    : { data: [] };
  const picks: TPick[] = (pickRows ?? []).map((p) => ({
    tieId: p.tie_id,
    playerId: p.player_id,
    pick: p.pick,
    totalGoals: p.total_goals,
  }));

  return { meta, rounds, ties, picks };
}
