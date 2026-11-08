"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/player";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
