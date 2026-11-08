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

  // Users: names only — the passcode column is deliberately ignored.
  const playerNames = rowsOf(sheet("users"))
    .map((r) => r.user_name)
    .filter(Boolean);

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
  for (const m of schedule) {
    const kickoff = easternToIso(m.dateEvent, m.strTime);
    const r = results.get(m.idEvent)!;
    const home = teamByName.get(m.strHomeTeam)!.code;
    const away = teamByName.get(m.strAwayTeam)!.code;
    lines.push(
      `insert into public.matches (id, season_id, segment_id, home_team_id, away_team_id, kickoff_at, locks_at, status, home_goals, away_goals, result_source) values (` +
        `${sql(m.idEvent)}, 2026, (select id from public.segments where season_id = 2026 and number = ${m.segment}), ` +
        `(select id from public.teams where code = ${sql(home)}), (select id from public.teams where code = ${sql(away)}), ` +
        `${sql(kickoff)}, ${sql(kickoff)}::timestamptz + interval '15 minutes', 'final', ${r.home}, ${r.away}, 'admin') on conflict (id) do nothing;`,
    );
  }
  lines.push(
    `insert into public.legacy_players (name) values ${playerNames
      .map((n) => `(${sql(n)})`)
      .join(", ")} on conflict (name) do nothing;`,
  );
  for (const p of picks) {
    lines.push(
      `insert into public.legacy_picks (match_id, legacy_player_id, pred_home, pred_away, submitted_at) values (` +
        `${sql(p.match)}, (select id from public.legacy_players where name = ${sql(p.player)}), ${p.home}, ${p.away}, ${sql(p.at)}) on conflict do nothing;`,
    );
  }
  lines.push("commit;", "");
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
