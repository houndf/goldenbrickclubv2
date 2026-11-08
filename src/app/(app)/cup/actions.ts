"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/player";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PickState {
  error?: string;
  savedAt?: string;
}

/** Save every pick for one round. The database refuses anything after the round locks. */
export async function saveRoundPicksAction(_prev: PickState, form: FormData): Promise<PickState> {
  const player = await requirePlayer();
  const roundId = Number(form.get("roundId"));
  if (!Number.isInteger(roundId)) return { error: "Something went wrong. Reload and try again." };

  const supabase = await createSupabaseServerClient();
  const { data: ties } = await supabase.from("tournament_ties").select("id").eq("round_id", roundId);
  const goalsRaw = form.get("totalGoals");
  const totalGoals = goalsRaw === null || goalsRaw === "" ? null : Number(goalsRaw);

  const rows = (ties ?? [])
    .map((t) => {
      const pick = form.get(`tie_${t.id}`);
      if (pick !== "home" && pick !== "away") return null;
      return {
        tie_id: t.id,
        player_id: player.id,
        pick,
        total_goals: totalGoals != null && Number.isInteger(totalGoals) ? Math.min(30, Math.max(0, totalGoals)) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return { error: "Pick at least one matchup." };

  const { error } = await supabase.from("tournament_picks").upsert(rows, { onConflict: "tie_id,player_id" });
  if (error) {
    if (error.code === "42501") return { error: "This round has locked. Picks can't be changed now." };
    console.error("saveRoundPicks failed", error);
    return { error: "Couldn't save your picks. Try again." };
  }
  revalidatePath("/cup");
  return { savedAt: new Date().toISOString() };
}

export interface TiePickResult {
  ok: boolean;
  error?: string;
}

/** Save one matchup's pick from the bracket. The database refuses it within an hour of kickoff. */
export async function saveTiePickAction(tieId: number, pick: "home" | "away", totalGoals: number | null): Promise<TiePickResult> {
  const player = await requirePlayer();
  if (!Number.isInteger(tieId) || (pick !== "home" && pick !== "away")) return { ok: false, error: "Something went wrong. Reload and try again." };
  const goals = totalGoals != null && Number.isInteger(totalGoals) ? Math.min(30, Math.max(0, totalGoals)) : null;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tournament_picks")
    .upsert({ tie_id: tieId, player_id: player.id, pick, total_goals: goals }, { onConflict: "tie_id,player_id" });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "This matchup has locked (an hour before kickoff)." };
    console.error("saveTiePick failed", error);
    return { ok: false, error: "Couldn't save your pick. Try again." };
  }
  revalidatePath("/cup");
  return { ok: true };
}
