"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { SEASON_TAG } from "@/lib/archiveData";
import { requireAdmin } from "@/lib/player";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { easternLocalToIso } from "@/lib/time";
import { TOURNAMENTS_TAG } from "@/lib/tournamentData";

/*
 * Admin data editor. Every action checks the caller is an admin, then writes
 * with the server key: an admin's edits ignore pick locks on purpose.
 * Each action redirects back with ?saved=<row> or ?error=<message>.
 */

const SEASON_LOCK_GRACE_MS = 15 * 60_000; // season picks lock 15 minutes after kickoff

const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const goals = (form: FormData, k: string): number | null | "bad" => {
  const v = str(form, k);
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 30 ? n : "bad";
};

function refresh() {
  updateTag(SEASON_TAG);
  updateTag(TOURNAMENTS_TAG);
  revalidatePath("/", "layout");
}

function back(path: string, saved: string): never {
  refresh();
  // Land back on the row that was just saved.
  redirect(`${path}?saved=${encodeURIComponent(saved)}#row-${encodeURIComponent(saved)}`);
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/* ---------- Season matches ---------- */

export async function saveMatchResultAction(form: FormData): Promise<void> {
  await requireAdmin();
  const id = str(form, "matchId");
  const path = `/admin/data/match/${encodeURIComponent(id)}`;
  const status = str(form, "status");
  if (!["scheduled", "live", "final", "postponed"].includes(status)) fail(path, "Pick a status.");
  const home = goals(form, "homeGoals");
  const away = goals(form, "awayGoals");
  if (home === "bad" || away === "bad") fail(path, "Goals must be whole numbers from 0 to 30.");
  if (status === "final" && (home === null || away === null)) fail(path, "A final result needs both scores.");
  const fg = str(form, "firstGoal");
  const firstGoal = fg === "home" || fg === "away" ? fg : null;
  if (firstGoal && (home ?? 0) + (away ?? 0) === 0) fail(path, "A 0–0 game can't have a first goal.");

  const update: Record<string, unknown> = {
    status,
    home_goals: home,
    away_goals: away,
    first_goal: firstGoal,
    result_source: status === "final" ? "admin" : null,
  };
  const kickoff = str(form, "kickoff");
  if (kickoff) {
    const iso = easternLocalToIso(kickoff);
    if (!iso) fail(path, "That kickoff time doesn't look right.");
    update.kickoff_at = iso;
    update.locks_at = new Date(Date.parse(iso) + SEASON_LOCK_GRACE_MS).toISOString();
  }
  const { error } = await createSupabaseAdminClient().from("matches").update(update).eq("id", id);
  if (error) fail(path, error.message);
  back(path, "result");
}

/** 2026-style exact-score prediction for one legacy player. Blank both boxes to clear it. */
export async function saveLegacyPickAction(form: FormData): Promise<void> {
  await requireAdmin();
  const matchId = str(form, "matchId");
  const legacyId = Number(str(form, "legacyPlayerId"));
  const path = `/admin/data/match/${encodeURIComponent(matchId)}`;
  const db = createSupabaseAdminClient();
  if (form.get("clear")) {
    const { error } = await db.from("legacy_picks").delete().eq("match_id", matchId).eq("legacy_player_id", legacyId);
    if (error) fail(path, error.message);
    back(path, `l${legacyId}`);
  }
  const home = goals(form, "predHome");
  const away = goals(form, "predAway");
  if (home === "bad" || away === "bad" || home === null || away === null) fail(path, "Enter both predicted scores (0–30).");
  const { error } = await db.from("legacy_picks").upsert(
    { match_id: matchId, legacy_player_id: legacyId, pred_home: home, pred_away: away, submitted_at: new Date().toISOString() },
    { onConflict: "match_id,legacy_player_id" },
  );
  if (error) fail(path, error.message);
  back(path, `l${legacyId}`);
}

/** Season pick (result / margin / first goal) for one player. */
export async function saveSeasonPickAction(form: FormData): Promise<void> {
  await requireAdmin();
  const matchId = str(form, "matchId");
  const playerId = str(form, "playerId");
  const path = `/admin/data/match/${encodeURIComponent(matchId)}`;
  const db = createSupabaseAdminClient();
  const result = str(form, "result");
  if (form.get("clear") || result === "") {
    const { error } = await db.from("picks").delete().eq("match_id", matchId).eq("player_id", playerId);
    if (error) fail(path, error.message);
    back(path, `p${playerId}`);
  }
  if (!["home", "draw", "away"].includes(result)) fail(path, "Pick home, draw or away.");
  const m = Number(str(form, "margin"));
  const margin = m === 1 || m === 2 || m === 3 ? m : null;
  if (result === "draw" && margin) fail(path, "A draw can't have a margin.");
  const fg = str(form, "firstGoal");
  const { error } = await db.from("picks").upsert(
    {
      match_id: matchId,
      player_id: playerId,
      result,
      margin,
      first_goal: fg === "home" || fg === "away" ? fg : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "match_id,player_id" },
  );
  if (error) fail(path, error.message);
  back(path, `p${playerId}`);
}

/* ---------- Cup matchups ---------- */

export async function saveTieResultAction(form: FormData): Promise<void> {
  await requireAdmin();
  const tieId = Number(str(form, "tieId"));
  const path = `/admin/data/tie/${tieId}`;
  const w = str(form, "winner");
  const total = goals(form, "totalGoals");
  if (total === "bad") fail(path, "Total goals must be a whole number from 0 to 30.");
  const update: Record<string, unknown> = {
    winner: w === "home" || w === "away" ? w : null,
    total_goals: total,
  };
  const kickoff = str(form, "kickoff");
  if (kickoff) {
    const iso = easternLocalToIso(kickoff);
    if (!iso) fail(path, "That kickoff time doesn't look right.");
    update.first_kickoff = iso;
  } else if (form.has("kickoff")) {
    update.first_kickoff = null;
  }
  const { error } = await createSupabaseAdminClient().from("tournament_ties").update(update).eq("id", tieId);
  if (error) fail(path, error.message);
  back(path, "result");
}

export async function saveTiePickAdminAction(form: FormData): Promise<void> {
  await requireAdmin();
  const tieId = Number(str(form, "tieId"));
  const playerId = str(form, "playerId");
  // Return to where the admin came from (the matchup page or a player's page).
  const backTo = str(form, "back");
  const path = backTo.startsWith("/admin/data/") ? backTo : `/admin/data/tie/${tieId}`;
  const db = createSupabaseAdminClient();
  const pick = str(form, "pick");
  if (form.get("clear") || pick === "") {
    const { error } = await db.from("tournament_picks").delete().eq("tie_id", tieId).eq("player_id", playerId);
    if (error) fail(path, error.message);
    back(path, path.startsWith("/admin/data/player/") ? `t${tieId}` : `p${playerId}`);
  }
  if (pick !== "home" && pick !== "away") fail(path, "Pick a team.");
  const total = goals(form, "totalGoals");
  if (total === "bad") fail(path, "Total goals must be a whole number from 0 to 30.");
  const { error } = await db
    .from("tournament_picks")
    .upsert(
      { tie_id: tieId, player_id: playerId, pick, total_goals: total, updated_at: new Date().toISOString() },
      { onConflict: "tie_id,player_id" },
    );
  if (error) fail(path, error.message);
  back(path, path.startsWith("/admin/data/player/") ? `t${tieId}` : `p${playerId}`);
}
