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

/** The signed-in player, or null. Verifies the session with Supabase. */
export async function getCurrentPlayer(): Promise<Player | null> {
  await cookies(); // always per-request, even before the database is configured
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, initials, avatar_color, role, extra_gold")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    initials: profile.initials,
    avatarColor: profile.avatar_color,
    role: profile.role,
    extraGold: profile.extra_gold,
  };
}

export async function requirePlayer(): Promise<Player> {
  const player = await getCurrentPlayer();
  if (!player) redirect("/login");
  return player;
}

export async function requireAdmin(): Promise<Player> {
  const player = await requirePlayer();
  if (player.role !== "admin") redirect("/home");
  return player;
}
