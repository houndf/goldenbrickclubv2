import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tournamentStandings, type TPick, type TRound, type TTie } from "./tournament";

/**
 * Finish a tournament and crown its Oracle: the top of the full standings
 * (not gold-only), ties broken by the final's total-goals guess.
 */
export async function crownOracle(supabase: SupabaseClient, tournamentId: number): Promise<string | null> {
  const { data: rounds } = await supabase
    .from("tournament_rounds")
    .select("id, number, name, points, locks_at, is_final")
    .eq("tournament_id", tournamentId);
  const roundIds = (rounds ?? []).map((r) => r.id);
  const { data: ties } = roundIds.length
    ? await supabase.from("tournament_ties").select("id, round_id, winner, total_goals").in("round_id", roundIds)
    : { data: [] };
  const tieIds = (ties ?? []).map((t) => t.id);
  const { data: picks } = tieIds.length
    ? await supabase.from("tournament_picks").select("tie_id, player_id, pick, total_goals").in("tie_id", tieIds)
    : { data: [] };
  const { data: profiles } = await supabase.from("profiles").select("id, username");
  const names = new Map((profiles ?? []).map((p) => [p.id, p.username as string]));

  const tRounds: TRound[] = (rounds ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    name: r.name,
    points: r.points,
    locksAt: r.locks_at,
    isFinal: r.is_final,
  }));
  const blank = { code: "", name: "" };
  const tTies: TTie[] = (ties ?? []).map((t) => ({
    id: t.id,
    roundId: t.round_id,
    slot: 0,
    label: null,
    teamA: blank,
    teamB: blank,
    seedA: null,
    seedB: null,
    winner: t.winner,
    totalGoals: t.total_goals,
  }));
  const tPicks: TPick[] = (picks ?? []).map((p) => ({
    tieId: p.tie_id,
    playerId: p.player_id,
    pick: p.pick,
    totalGoals: p.total_goals,
  }));
  const pickers = [...new Set(tPicks.map((p) => p.playerId))];
  const standings = tournamentStandings(tRounds, tTies, tPicks, pickers, (id) => names.get(id) ?? id);
  const oracle = standings[0]?.points ? standings[0].playerId : null;

  await supabase
    .from("tournaments")
    .update({ status: "final", oracle_profile_id: oracle, finished_at: new Date().toISOString() })
    .eq("id", tournamentId);
  return oracle;
}
