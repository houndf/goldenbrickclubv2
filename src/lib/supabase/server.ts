import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "./env";

/** Supabase client acting as the signed-in player (respects row-level security). */
export async function createSupabaseServerClient() {
  // Read cookies first: it marks the page as per-request, never prerendered.
  const cookieStore = await cookies();
  const { url, key } = publicEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Supabase client with the secret key. Bypasses row-level security — use
 * only in server code, only after checking who is asking.
 */
export function createSupabaseAdminClient() {
  const { url } = publicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SECRET_KEY. See README → Setup.");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
