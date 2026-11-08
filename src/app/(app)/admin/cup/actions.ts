"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/player";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { easternLocalToIso } from "@/lib/time";
import { crownOracle } from "@/lib/tournamentCrown";
import { TOURNAMENTS_TAG } from "@/lib/tournamentData";

function refresh() {
  updateTag(TOURNAMENTS_TAG);
  revalidatePath("/cup");
  revalidatePath("/admin/cup");
}

const num = (v: FormDataEntryValue | null) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

export interface CreateState {
  error?: string;
}

export async function createTournamentAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const trophy = String(form.get("trophyName") ?? "").trim() || `${name} Oracle`;
  const roundNames = String(form.get("rounds") ?? "")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  if (name.length < 2) return { error: "Give the tournament a name." };
  if (roundNames.length === 0) return { error: "Add at least one round, one per line." };
  if (roundNames.length > 8) return { error: "Up to 8 rounds." };

  const supabase = await createSupabaseServerClient();
  const { data: t, error } = await supabase
    .from("tournaments")
    .insert({ name, trophy_name: trophy })
    .select("id")
    .single();
  if (error || !t) {
    console.error("createTournament failed", error);
    return { error: "Couldn't create the tournament." };
  }
  const { error: roundsError } = await supabase.from("tournament_rounds").insert(
    roundNames.map((roundName, i) => ({
      tournament_id: t.id,
      number: i + 1,
      name: roundName.slice(0, 40),
      points: i + 1,
      is_final: i === roundNames.length - 1,
    })),
  );
  if (roundsError) console.error("createTournament rounds failed", roundsError);
  refresh();
  redirect(`/admin/cup?t=${t.id}`);
}

export async function setTournamentStatusAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = num(form.get("id"));
  const status = form.get("status") === "live" ? "live" : "setup";
  const supabase = await createSupabaseServerClient();
  if (status === "live") {
    // Only one tournament can be live; put any other back into setup first.
    await supabase.from("tournaments").update({ status: "setup" }).eq("status", "live").neq("id", id);
  }
  await supabase.from("tournaments").update({ status }).eq("id", id);
  refresh();
}

export async function saveRoundAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = num(form.get("roundId"));
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const locksRaw = String(form.get("locksAt") ?? "");
  const locksAt = locksRaw ? easternLocalToIso(locksRaw) : null;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("tournament_rounds")
    .update({ ...(name ? { name } : {}), locks_at: locksAt })
    .eq("id", id);
  refresh();
}

export async function addTieAction(form: FormData): Promise<void> {
  await requireAdmin();
  const roundId = num(form.get("roundId"));
  const teamA = num(form.get("teamA"));
  const teamB = num(form.get("teamB"));
  if (!roundId || !teamA || !teamB || teamA === teamB) return;
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("tournament_ties")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  await supabase.from("tournament_ties").insert({
    round_id: roundId,
    slot: (count ?? 0) + 1,
    label: String(form.get("label") ?? "").trim().toUpperCase().slice(0, 12) || null,
    team_a_id: teamA,
    team_b_id: teamB,
    seed_a: num(form.get("seedA")),
    seed_b: num(form.get("seedB")),
    first_kickoff: form.get("kickoff") ? easternLocalToIso(String(form.get("kickoff"))) : null,
  });
  refresh();
}

export async function removeTieAction(form: FormData): Promise<void> {
  await requireAdmin();
  const tieId = num(form.get("tieId"));
  if (!tieId) return;
  // Never delete a matchup someone has picked (that would delete their picks too).
  const { count } = await createSupabaseAdminClient()
    .from("tournament_picks")
    .select("tie_id", { count: "exact", head: true })
    .eq("tie_id", tieId);
  if (count) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("tournament_ties").delete().eq("id", tieId);
  refresh();
}

export async function setTieResultAction(form: FormData): Promise<void> {
  await requireAdmin();
  const winnerRaw = form.get("winner");
  const winner = winnerRaw === "home" || winnerRaw === "away" ? winnerRaw : null;
  const supabase = await createSupabaseServerClient();
  const update: Record<string, unknown> = { winner };
  if (form.has("totalGoals")) update.total_goals = num(form.get("totalGoals"));
  await supabase.from("tournament_ties").update(update).eq("id", num(form.get("tieId")));
  refresh();
}

/** Crown the Oracle: the top of the full (not gold-only) standings, ties broken by the final's total goals. */
export async function finishTournamentAction(form: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const id = num(form.get("id"));
  if (id) await crownOracle(supabase, id);
  refresh();
}

export async function reopenTournamentAction(form: FormData): Promise<void> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("tournaments")
    .update({ status: "setup", oracle_profile_id: null, finished_at: null })
    .eq("id", num(form.get("id")));
  refresh();
}
