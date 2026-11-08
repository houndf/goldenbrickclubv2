import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "./env";

/**
 * Read-only client for public data (schedule, results, the 2026 archive).
 * No session, so it's safe inside cached functions.
 */
export function createSupabasePublicClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, key } = publicEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
