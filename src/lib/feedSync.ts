import "server-only";
import feedJson from "../../data/feed.json";
import teamsJson from "../../data/teams.json";
import { validateFeed, type Feed, type FeedMatch } from "./feed";
import { createSupabaseAdminClient } from "./supabase/server";
import { crownOracle } from "./tournamentCrown";

const feed = feedJson as Feed;
const LOCK_GRACE_MS = 15 * 60_000; // season picks lock 15 minutes after kickoff
const SEGMENTS_PER_SEASON = 4;

export interface SyncResult {
  applied: boolean;
  version: number;
  notes: string[];
}

/** Split a season's matches (in kickoff order) into 4 near-equal segments: 34 → 9, 9, 8, 8. */
export function segmentFor(index: number, total: number, segments = SEGMENTS_PER_SEASON): number {
  const base = Math.floor(total / segments);
  const extra = total % segments;
  let start = 0;
  for (let s = 1; s <= segments; s++) {
    const size = base + (s <= extra ? 1 : 0);
    if (index < start + size) return s;
    start += size;
  }
  return segments;
}

/**
 * Import data/feed.json into the database if it's newer than what's there.
 * Safe to call repeatedly; does nothing once the version is imported.
 */
export async function syncFeed(): Promise<SyncResult> {
  const notes: string[] = [];
  const problems = validateFeed(feed, new Set((teamsJson as { code: string }[]).map((t) => t.code)));
  if (problems.length) return { applied: false, version: feed.version, notes: ["feed invalid", ...problems] };

  const db = createSupabaseAdminClient();
  const { data: settings } = await db.from("league_settings").select("feed_version").eq("id", true).single();
  if ((settings?.feed_version ?? 0) >= feed.version) return { applied: false, version: feed.version, notes: ["up to date"] };

  const { data: teamRows } = await db.from("teams").select("id, code");
  const teamId = new Map((teamRows ?? []).map((t) => [t.code as string, t.id as number]));

  await syncAtlanta(db, teamId, notes);
  await syncStandings(db, teamId, notes);
  await syncTournaments(db, teamId, notes);

  await db.from("league_settings").update({ feed_version: feed.version }).eq("id", true);
  notes.push(`imported feed v${feed.version}`);
  return { applied: true, version: feed.version, notes };
}

type Db = ReturnType<typeof createSupabaseAdminClient>;

async function syncAtlanta(db: Db, teamId: Map<string, number>, notes: string[]) {
  const season = feed.atlanta.season;
  const matches = [...feed.atlanta.matches].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  if (matches.length === 0) return;

  await db
    .from("seasons")
    .upsert({ id: season, scoring: season >= 2027 ? "pick_v2" : "legacy_exact", status: "live" }, { onConflict: "id", ignoreDuplicates: true });

  const { data: existing } = await db
    .from("matches")
    .select("id, result_source, status")
    .in(
      "id",
      matches.map((m) => m.id),
    );
  const known = new Map((existing ?? []).map((m) => [m.id as string, m]));

  // New matches need a segment; create the season's segments if missing.
  const needSegments = matches.some((m) => !known.has(m.id));
  const segmentId = new Map<number, number>();
  if (needSegments) {
    await db.from("segments").upsert(
      Array.from({ length: SEGMENTS_PER_SEASON }, (_, i) => ({ season_id: season, number: i + 1 })),
      { onConflict: "season_id,number", ignoreDuplicates: true },
    );
    const { data: segs } = await db.from("segments").select("id, number").eq("season_id", season);
    for (const s of segs ?? []) segmentId.set(s.number, s.id);
  }

  let changed = 0;
  for (const [index, m] of matches.entries()) {
    const row = known.get(m.id);
    const fields = matchFields(m);
    if (!row) {
      const { error } = await db.from("matches").insert({
        id: m.id,
        season_id: season,
        segment_id: segmentId.get(segmentFor(index, matches.length)),
        home_team_id: teamId.get(m.home),
        away_team_id: teamId.get(m.away),
        ...fields,
      });
      if (error) notes.push(`match ${m.id}: ${error.message}`);
      else changed++;
      continue;
    }
    // A result an admin typed in wins over the feed (even a feed that hasn't caught up yet).
    if (row.result_source === "admin" && row.status === "final") {
      const { error } = await db.from("matches").update({ kickoff_at: m.kickoff }).eq("id", m.id);
      if (error) notes.push(`match ${m.id}: ${error.message}`);
      continue;
    }
    const { error } = await db.from("matches").update(fields).eq("id", m.id);
    if (error) notes.push(`match ${m.id}: ${error.message}`);
    else changed++;
  }
  notes.push(`atlanta: ${changed} matches updated`);
}

function matchFields(m: FeedMatch) {
  const finalWithGoals = m.status === "final" && (m.homeGoals ?? 0) + (m.awayGoals ?? 0) > 0;
  return {
    kickoff_at: m.kickoff,
    locks_at: new Date(Date.parse(m.kickoff) + LOCK_GRACE_MS).toISOString(),
    status: m.status,
    home_goals: m.homeGoals,
    away_goals: m.awayGoals,
    first_goal: finalWithGoals ? m.firstGoal : null,
    result_source: m.status === "final" ? "api" : null,
  };
}

async function syncStandings(db: Db, teamId: Map<string, number>, notes: string[]) {
  const s = feed.standings;
  if (s.teams.length === 0) return;
  const rows = s.teams.map((t) => ({
    season_id: s.season,
    team_id: teamId.get(t.code),
    conference: t.conference,
    rank: t.rank,
    played: t.played,
    wins: t.wins,
    draws: t.draws,
    losses: t.losses,
    goals_for: t.goalsFor,
    goals_against: t.goalsAgainst,
    points: t.points,
    form: t.form,
    as_of: s.asOf,
  }));
  const { error } = await db.from("team_standings").upsert(rows, { onConflict: "season_id,team_id" });
  notes.push(error ? `standings: ${error.message}` : `standings: ${rows.length} teams`);
}

async function syncTournaments(db: Db, teamId: Map<string, number>, notes: string[]) {
  for (const t of feed.tournaments) {
    let { data: row } = await db
      .from("tournaments")
      .select("id, status")
      .eq("external_key", t.key)
      .maybeSingle();

    if (!row) {
      // Adopt a tournament an admin already started by hand with the same name.
      const { data: manual } = await db
        .from("tournaments")
        .select("id, status")
        .eq("name", t.name)
        .is("external_key", null)
        .neq("status", "final")
        .limit(1)
        .maybeSingle();
      if (manual) {
        await db.from("tournaments").update({ external_key: t.key }).eq("id", manual.id);
        row = manual;
        notes.push(`tournament ${t.key}: adopted the one created in admin`);
      }
    }

    if (!row) {
      // Go live straight away unless another tournament already is.
      const { data: live } = await db.from("tournaments").select("id").eq("status", "live").maybeSingle();
      const { data: created, error } = await db
        .from("tournaments")
        .insert({ external_key: t.key, name: t.name, trophy_name: t.trophyName, status: live ? "setup" : "live" })
        .select("id, status")
        .single();
      if (error || !created) {
        notes.push(`tournament ${t.key}: ${error?.message}`);
        continue;
      }
      row = created;
      notes.push(`tournament ${t.key}: created (${created.status})`);
    }
    if (row.status === "final") continue;
    if (row.status === "setup") {
      const { data: live } = await db.from("tournaments").select("id").eq("status", "live").maybeSingle();
      if (!live) {
        await db.from("tournaments").update({ status: "live" }).eq("id", row.id);
        notes.push(`tournament ${t.key}: now live`);
      }
    }
    await db.from("tournaments").update({ name: t.name, trophy_name: t.trophyName }).eq("id", row.id);

    for (const [i, r] of t.rounds.entries()) {
      const kickoffs = r.ties.map((x) => x.firstKickoff).filter((k): k is string => Boolean(k)).sort();
      const { data: round, error: roundError } = await db
        .from("tournament_rounds")
        .upsert(
          {
            tournament_id: row.id,
            number: r.number,
            name: r.name,
            points: r.number,
            is_final: i === t.rounds.length - 1,
            // Only when the feed knows; don't wipe a start time an admin set.
            ...(kickoffs[0] ? { locks_at: kickoffs[0] } : {}),
          },
          { onConflict: "tournament_id,number" },
        )
        .select("id")
        .single();
      if (roundError || !round) {
        notes.push(`round ${r.name}: ${roundError?.message}`);
        continue;
      }

      const { data: existingTies } = await db
        .from("tournament_ties")
        .select("id, external_key")
        .eq("round_id", round.id);
      const byKey = new Map((existingTies ?? []).map((x) => [x.external_key as string | null, x.id as number]));
      const { data: pickRows } = existingTies?.length
        ? await db
            .from("tournament_picks")
            .select("tie_id")
            .in(
              "tie_id",
              existingTies.map((x) => x.id),
            )
        : { data: [] };
      const hasPicks = new Set((pickRows ?? []).map((p) => p.tie_id as number));

      for (const [slot, tie] of r.ties.entries()) {
        // Kickoff, winner and goals only overwrite when the feed has them, so a blank
        // in the feed never erases something an admin entered by hand.
        const fields = {
          slot: slot + 1,
          label: tie.label,
          seed_a: tie.seedA,
          seed_b: tie.seedB,
          ...(tie.winner ? { winner: tie.winner === "a" ? "home" : "away" } : {}),
          ...(tie.totalGoals != null ? { total_goals: tie.totalGoals } : {}),
          ...(tie.firstKickoff ? { first_kickoff: tie.firstKickoff } : {}),
        };
        const id = byKey.get(tie.key);
        if (id === undefined) {
          const { error } = await db.from("tournament_ties").insert({
            round_id: round.id,
            external_key: tie.key,
            team_a_id: teamId.get(tie.teamA),
            team_b_id: teamId.get(tie.teamB),
            ...fields,
          });
          if (error) notes.push(`tie ${tie.key}: ${error.message}`);
        } else {
          // Never swap teams under someone's pick.
          const teams = hasPicks.has(id) ? {} : { team_a_id: teamId.get(tie.teamA), team_b_id: teamId.get(tie.teamB) };
          const { error } = await db.from("tournament_ties").update({ ...fields, ...teams }).eq("id", id);
          if (error) notes.push(`tie ${tie.key}: ${error.message}`);
        }
      }

      // Drop matchups the feed no longer has, unless someone picked them.
      const feedKeys = new Set(r.ties.map((x) => x.key));
      for (const x of existingTies ?? []) {
        if (x.external_key && !feedKeys.has(x.external_key) && !hasPicks.has(x.id)) {
          await db.from("tournament_ties").delete().eq("id", x.id);
        }
      }
    }

    if (t.status === "final") {
      const oracle = await crownOracle(db, row.id);
      notes.push(`tournament ${t.key}: finished, oracle ${oracle ?? "none"}`);
    }
  }
}
