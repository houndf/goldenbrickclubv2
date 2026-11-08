import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./supabase/env";
import { createSupabaseServerClient } from "./supabase/server";

export interface Player {
  id: string;
  username: string;
  initials: string;
  avatarColor: string;
  role: "player" | "admin";
  extraGold: boolean;
}

type Lookup = { player: Player | null; orphan: boolean };

/** Signed-in player, plus whether the session is signed in with no profile behind it. */
async function lookupPlayer(): Promise<Lookup> {
  await cookies(); // always per-request, even before the database is configured
  if (!isSupabaseConfigured()) return { player: null, orphan: false };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return { player: null, orphan: false };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, initials, avatar_color, role, extra_gold")
    .eq("id", id)
    .maybeSingle();
  // Only a clean "no such profile" counts as orphaned, never a failed query.
  if (!profile) return { player: null, orphan: !error };

  return {
    player: {
      id: profile.id,
      username: profile.username,
      initials: profile.initials,
      avatarColor: profile.avatar_color,
      role: profile.role,
      extraGold: profile.extra_gold,
    },
    orphan: false,
  };
}

/** The signed-in player, or null. Verifies the session with Supabase. */
export async function getCurrentPlayer(): Promise<Player | null> {
  return (await lookupPlayer()).player;
}

export async function requirePlayer(): Promise<Player> {
  const { player, orphan } = await lookupPlayer();
  // Signed in but no profile (e.g. a half-finished signup): sign out first, or the
  // login page would send them straight back here in a loop.
  if (orphan) redirect("/auth/signout");
  if (!player) redirect("/login");
  return player;
}

export async function requireAdmin(): Promise<Player> {
  const player = await requirePlayer();
  if (player.role !== "admin") redirect("/home");
  return player;
}
