/**
 * Rebuild the 2026 season (played on the original Streamlit app) as seed
 * data for the 2026 archive.
 *
 *   npm run import:2026 -- <path to MLS_Predictions_2026.xlsx> [out.sql]
 *
 * Reads the predictions, users and fixtures tabs of the old Google Sheet
 * export. Passcodes are never read. Writes a SQL seed file (gitignored by
 * default, since it holds players' names and picks) and prints the 2026
 * standings under the old exact-score rules so they can be checked.
 */
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { legacyAccuracyOffset, legacyPoints } from "../src/lib/scoring/legacy";

interface ScheduleRow {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  dateEvent: string; // YYYY-MM-DD
  strTime: string; // HH:MM:SS, Eastern local time
  segment: number;
}
interface Team {
  code: string;
  name: string;
  conference: "east" | "west";
}

const root = path.resolve(import.meta.dirname, "..");
const [xlsxPath, outArg] = process.argv.slice(2);
if (!xlsxPath) {
  console.error("Usage: npm run import:2026 -- <MLS_Predictions_2026.xlsx> [out.sql]");
  process.exit(1);
}
const outPath = outArg ?? path.join(root, "supabase/seed/2026.local.sql");

const schedule: ScheduleRow[] = JSON.parse(
  readFileSync(path.join(root, "data/2026-schedule.json"), "utf8"),
);
const teams: Team[] = JSON.parse(readFileSync(path.join(root, "data/teams.json"), "utf8"));
const teamByName = new Map(teams.map((t) => [t.name, t]));

/** "2026-03-07" + "19:30:00" in America/New_York → ISO string with offset. */
function easternToIso(date: string, time: string): string {
  const naiveUtc = new Date(`${date}T${time}Z`);
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  })
    .formatToParts(naiveUtc)
    .find((p) => p.type === "timeZoneName")!.value; // e.g. "GMT-05:00"
  const offset = offsetPart.replace("GMT", "") || "+00:00";
  return `${date}T${time}${offset}`;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "result" in value) return cellText(value.result as ExcelJS.CellValue);
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value).trim();
}

function rowsOf(sheet: ExcelJS.Worksheet): Record<string, string>[] {
  const header: string[] = [];
  const out: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
    if (rowNumber === 1) {
      header.push(...values);
      return;
    }
    const record: Record<string, string> = {};
    header.forEach((key, i) => {
      if (key) record[key] = values[i] ?? "";
    });
    out.push(record);
  });
  return out;
}

const sql = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = (name: string) => {
    const ws = workbook.getWorksheet(name);
    if (!ws) throw new Error(`Missing "${name}" tab in ${xlsxPath}`);
    return ws;
  };

  // Users: name, role and Extra Gold only — the passcode column is never read.
  const users = rowsOf(sheet("users"))
    .filter((r) => r.user_name)
    .map((r) => ({
      name: r.user_name,
      admin: r.user_type?.toLowerCase() === "admin",
      extraGold: ["1", "true", "yes"].includes((r.extra_gold_status ?? "").toLowerCase()),
    }));
  const playerNames = users.map((u) => u.name);

  // Results: keep finished rows; one per match.
  const results = new Map<string, { home: number; away: number }>();
  for (const r of rowsOf(sheet("fixtures"))) {
    if (r.is_finished?.toLowerCase() !== "true" || !r.match_id) continue;
    results.set(r.match_id, { home: Number(r.home_score), away: Number(r.away_score) });
  }

  // Picks: the latest save per player per match wins (as in the old app).
  const latest = new Map<string, { at: string; player: string; match: string; home: number; away: number }>();
  let rawPicks = 0;
  for (const r of rowsOf(sheet("predictions"))) {
    if (!r.user_name || !r.match_id) continue;
    rawPicks += 1;
    const key = `${r.user_name}\u0000${r.match_id}`;
    const pick = {
      at: r.submitted_at,
      player: r.user_name,
      match: r.match_id,
      home: Number(r.pred_home),
      away: Number(r.pred_away),
    };
    const prev = latest.get(key);
    if (!prev || pick.at >= prev.at) latest.set(key, pick);
  }
  const picks = [...latest.values()];

  // ---- Checks -------------------------------------------------------------
  const problems: string[] = [];
  for (const m of schedule) {
    for (const name of [m.strHomeTeam, m.strAwayTeam]) {
      if (!teamByName.has(name)) problems.push(`Unknown team "${name}" in ${m.idEvent}`);
    }
    if (!results.has(m.idEvent)) problems.push(`No final score for ${m.idEvent}`);
  }
  for (const p of picks) {
    if (!playerNames.includes(p.player)) problems.push(`Pick by unknown player "${p.player}"`);
    if (!schedule.some((m) => m.idEvent === p.match)) problems.push(`Pick for unknown match ${p.match}`);
    if (![p.home, p.away].every((g) => Number.isInteger(g) && g >= 0)) {
      problems.push(`Bad score in pick ${p.player}/${p.match}`);
    }
  }
  if (problems.length) {
    console.error("Import stopped:\n - " + problems.join("\n - "));
    process.exit(1);
  }

  // ---- SQL ----------------------------------------------------------------
  const lines: string[] = [
    "-- 2026 archive seed, generated by scripts/import-2026.ts. Contains player names and picks.",
    "begin;",
    "insert into public.seasons (id, scoring, status) values (2026, 'legacy_exact', 'final') on conflict (id) do nothing;",
  ];
  const segments = [...new Set(schedule.map((m) => m.segment))].sort((a, b) => a - b);
  lines.push(
    `insert into public.segments (season_id, number) values ${segments
      .map((n) => `(2026, ${n})`)
      .join(", ")} on conflict do nothing;`,
  );
  lines.push(
    `insert into public.teams (code, name, conference) values\n  ${teams
      .map((t) => `(${sql(t.code)}, ${sql(t.name)}, ${sql(t.conference)})`)
      .join(",\n  ")}\non conflict (code) do nothing;`,
  );
  const matchRows = schedule.map((m) => {
    const r = results.get(m.idEvent)!;
    const home = teamByName.get(m.strHomeTeam)!.code;
    const away = teamByName.get(m.strAwayTeam)!.code;
    const kickoff = easternToIso(m.dateEvent, m.strTime);
    return `(${sql(m.idEvent)},${m.segment},${sql(home)},${sql(away)},${sql(kickoff)},${r.home},${r.away})`;
  });
  lines.push(
    "insert into public.matches (id, season_id, segment_id, home_team_id, away_team_id, kickoff_at, locks_at, status, home_goals, away_goals, result_source)",
    "select v.id, 2026, s.id, h.id, a.id, v.k::timestamptz, v.k::timestamptz + interval '15 minutes', 'final', v.hg, v.ag, 'admin'",
    `from (values\n${matchRows.join(",\n")}\n) as v(id, seg, home, away, k, hg, ag)`,
    "join public.segments s on s.season_id = 2026 and s.number = v.seg",
    "join public.teams h on h.code = v.home",
    "join public.teams a on a.code = v.away",
    "on conflict (id) do nothing;",
  );
  lines.push(
    `insert into public.legacy_players (name, extra_gold, was_admin) values ${users
      .map((u) => `(${sql(u.name)}, ${u.extraGold}, ${u.admin})`)
      .join(", ")} on conflict (name) do nothing;`,
  );
  lines.push(
    "insert into public.legacy_picks (match_id, legacy_player_id, pred_home, pred_away, submitted_at)",
    "select v.m, lp.id, v.h, v.a, v.t::timestamptz",
    `from (values\n${picks
      .map((p) => `(${sql(p.match)},${sql(p.player)},${p.home},${p.away},${sql(p.at)})`)
      .join(",\n")}\n) as v(m, player, h, a, t)`,
    "join public.legacy_players lp on lp.name = v.player",
    "on conflict do nothing;",
  );
  // One invite per 2026 player, carrying their history, Extra Gold and admin role.
  lines.push(
    "insert into public.invite_codes (note, legacy_player_id, grants_admin, grants_extra_gold)",
    "select lp.name, lp.id, lp.was_admin, lp.extra_gold from public.legacy_players lp",
    "where not exists (select 1 from public.invite_codes ic where ic.legacy_player_id = lp.id);",
  );
  lines.push("commit;", "");
  lines.push("-- Invite codes to hand out:");
  lines.push(
    "select ic.note as player, ic.code, ic.grants_admin as admin, ic.grants_extra_gold as extra_gold",
    "from public.invite_codes ic where ic.used_at is null order by ic.grants_admin desc, ic.note;",
    "",
  );
  writeFileSync(outPath, lines.join("\n"));

  // ---- Verification report (old exact-score rules) --------------------------
  const segmentOf = new Map(schedule.map((m) => [m.idEvent, m.segment]));
  type Tally = { points: number; offset: number; picks: number };
  const tally = (filter: (match: string) => boolean) => {
    const t = new Map<string, Tally>();
    for (const p of picks) {
      if (!filter(p.match)) continue;
      const r = results.get(p.match)!;
      const row = t.get(p.player) ?? { points: 0, offset: 0, picks: 0 };
      row.points += legacyPoints(p.home, p.away, r.home, r.away);
      row.offset += legacyAccuracyOffset(p.home, p.away, r.home, r.away);
      row.picks += 1;
      t.set(p.player, row);
    }
    return [...t.entries()].sort((a, b) => b[1].points - a[1].points || a[1].offset - b[1].offset);
  };

  console.log(`Read ${rawPicks} saved picks → ${picks.length} final picks, ${playerNames.length} players, ${results.size} results.`);
  console.log(`Wrote ${path.relative(root, outPath)}\n`);
  console.log("2026 season (old rules: points, then lowest accuracy offset):");
  for (const [i, [name, t]] of tally(() => true).entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. ${name.padEnd(18)} ${String(t.points).padStart(4)} pts  offset ${t.offset}  (${t.picks} picks)`);
  }
  console.log("\nSegment winners / Wooden Spoons:");
  for (const n of segments) {
    const s = tally((m) => segmentOf.get(m) === n);
    const top = s[0];
    const bottom = s[s.length - 1];
    console.log(
      `  Segment ${n}: ${top[0]} (${top[1].points}) / ${bottom[0]} (${bottom[1].points})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
