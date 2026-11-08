import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "./supabase/public";

export const SETTINGS_TAG = "league-settings";

export interface LeagueSettings {
  resultsHidden: boolean;
}

/** League-wide switches. Cached, and refreshed the moment an admin changes one. */
export async function getLeagueSettings(): Promise<LeagueSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("hours");

  const supabase = createSupabasePublicClient();
  if (!supabase) return { resultsHidden: false };
  const { data, error } = await supabase.from("league_settings").select("results_hidden").maybeSingle();
  if (error) {
    // Before the settings migration runs, behave as if nothing is hidden.
    console.error("getLeagueSettings failed", error.message);
    return { resultsHidden: false };
  }
  return { resultsHidden: Boolean(data?.results_hidden) };
}
