"use server";

import { revalidatePath, updateTag } from "next/cache";
import { temporaryPassword } from "@/lib/accounts";
import { SEASON_TAG } from "@/lib/archiveData";
import { requireAdmin } from "@/lib/player";
import { SETTINGS_TAG } from "@/lib/settings";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export interface InviteState {
  error?: string;
  code?: string;
  note?: string;
}

export interface ResetState {
  error?: string;
  playerId?: string;
  username?: string;
  password?: string;
}

export async function createInviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const note = String(form.get("note") ?? "").trim().slice(0, 60);
  const legacyRaw = String(form.get("legacyPlayerId") ?? "");
  const legacyPlayerId = legacyRaw ? Number(legacyRaw) : null;
  if (!note && !legacyPlayerId) return { error: "Add who the invite is for." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invite_codes")
    .insert({
      note: note || null,
      legacy_player_id: legacyPlayerId,
      grants_admin: form.get("grantsAdmin") === "on",
      grants_extra_gold: form.get("grantsExtraGold") === "on",
      created_by: admin.id,
    })
    .select("code, note")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "That 2026 player already has an invite." };
    console.error("createInvite failed", error);
    return { error: "Couldn't create the invite." };
  }
  revalidatePath("/admin");
  return { code: data.code, note: data.note ?? undefined };
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  await requireAdmin();
  const code = String(form.get("code") ?? "");
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("invite_codes")
    .update({ revoked_at: new Date().toISOString(), legacy_player_id: null })
    .eq("code", code)
    .is("used_at", null);
  revalidatePath("/admin");
}

export async function resetPasswordAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  await requireAdmin();
  const playerId = String(form.get("playerId") ?? "");
  const username = String(form.get("username") ?? "");
  const password = temporaryPassword();
  const service = createSupabaseAdminClient();
  const { error } = await service.auth.admin.updateUserById(playerId, { password });
  if (error) {
    console.error("resetPassword failed", error);
    return { error: "Couldn't reset that password.", playerId };
  }
  return { playerId, username, password };
}

export async function setRoleAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const playerId = String(form.get("playerId") ?? "");
  const role = form.get("role") === "admin" ? "admin" : "player";
  if (playerId === admin.id && role !== "admin") return; // can't remove your own admin access
  const supabase = await createSupabaseServerClient();
  await supabase.from("profiles").update({ role }).eq("id", playerId);
  revalidatePath("/admin");
}

export async function setExtraGoldAction(form: FormData): Promise<void> {
  await requireAdmin();
  const playerId = String(form.get("playerId") ?? "");
  const extraGold = form.get("extraGold") === "true";
  const supabase = await createSupabaseServerClient();
  await supabase.from("profiles").update({ extra_gold: extraGold }).eq("id", playerId);
  // Gold-only tables are built from cached season data; refresh it.
  updateTag(SEASON_TAG);
  revalidatePath("/", "layout");
}

export async function setResultsHiddenAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const hidden = form.get("hidden") === "true";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("league_settings")
    .update({ results_hidden: hidden, updated_by: admin.id, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) console.error("setResultsHidden failed", error);
  updateTag(SETTINGS_TAG);
  revalidatePath("/", "layout");
}
