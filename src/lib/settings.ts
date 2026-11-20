import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabasePublicClient } from "./supabase/public";

export const SETTINGS_TAG = "league-settings";

export interface LeagueSettings {
  resultsHidden: boolean;
  /** Admin override: every pick without a result can be made or changed, whatever its lock time. */
  picksUnlocked: boolean;
}

const DEFAULTS: LeagueSettings = { resultsHidden: false, picksUnlocked: false };

/** League-wide switches. Cached, and refreshed the moment an admin changes one. */
export async function getLeagueSettings(): Promise<LeagueSettings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("hours");

  const supabase = createSupabasePublicClient();
  if (!supabase) return DEFAULTS;
  // select("*") so a switch whose column isn't in the database yet just reads as off.
  const { data, error } = await supabase.from("league_settings").select("*").maybeSingle();
  if (error) {
    // Before the settings migrations run, behave as if nothing is switched on.
    console.error("getLeagueSettings failed", error.message);
    return DEFAULTS;
  }
  return { resultsHidden: Boolean(data?.results_hidden), picksUnlocked: Boolean(data?.picks_unlocked) };
}
