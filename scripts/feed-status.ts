/**
 * Check data/feed.json and report what (if anything) needs updating.
 *
 *   npm run feed:status            validate + list matches that need a result check
 *   npm run feed:status -- --json  same, machine-readable
 *
 * Exits with code 1 if the feed is invalid. The scheduled task runs this
 * before and after editing the feed, and only commits when it passes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateFeed, type Feed } from "../src/lib/feed";

const root = path.resolve(import.meta.dirname, "..");
const feed: Feed = JSON.parse(readFileSync(path.join(root, "data/feed.json"), "utf8"));
const teams: { code: string }[] = JSON.parse(readFileSync(path.join(root, "data/teams.json"), "utf8"));
const problems = validateFeed(feed, new Set(teams.map((t) => t.code)));

const now = Date.now();
const MATCH_LENGTH_MIN = 115; // 90 + halftime + stoppage
const GRACE_MIN = 15;
const due = (kickoff: string) => Date.parse(kickoff) + (MATCH_LENGTH_MIN + GRACE_MIN) * 60_000;

// Atlanta matches whose result should be in by now but isn't.
const needsResult = feed.atlanta.matches
  .filter((m) => m.status !== "final" && m.status !== "postponed" && due(m.kickoff) <= now)
  .map((m) => ({ id: m.id, kickoff: m.kickoff, home: m.home, away: m.away }));

// Final Atlanta matches still missing who scored first.
const needsFirstGoal = feed.atlanta.matches
  .filter((m) => m.status === "final" && m.firstGoal === null && (m.homeGoals ?? 0) + (m.awayGoals ?? 0) > 0)
  .filter((m) => m.id.startsWith(`ATL${String(feed.atlanta.season).slice(2)}`) && feed.atlanta.season >= 2027)
  .map((m) => m.id);

// Tournament matchups that should be decided by now.
const tiesToCheck = feed.tournaments
  .filter((t) => t.status === "live")
  .flatMap((t) =>
    t.rounds.flatMap((r) =>
      r.ties
        .filter((x) => x.winner === null && x.firstKickoff && due(x.firstKickoff) <= now)
        .map((x) => ({ tournament: t.key, round: r.name, tie: x.key, teams: `${x.teamA} v ${x.teamB}` })),
    ),
  );

// Rounds of a live tournament that have no matchups yet (bracket may need filling in).
const emptyRounds = feed.tournaments
  .filter((t) => t.status === "live")
  .flatMap((t) => t.rounds.filter((r) => r.ties.length === 0).map((r) => ({ tournament: t.key, round: r.name })));

// Upcoming kickoffs in the next 7 days (Atlanta + live tournaments), to schedule follow-up checks.
const week = now + 7 * 24 * 3600_000;
const upcoming = [
  ...feed.atlanta.matches
    .filter((m) => m.status !== "final" && Date.parse(m.kickoff) > now - 3 * 3600_000 && Date.parse(m.kickoff) < week)
    .map((m) => ({ what: `${m.home} v ${m.away}`, kickoff: m.kickoff, checkAt: new Date(due(m.kickoff)).toISOString() })),
  ...feed.tournaments
    .filter((t) => t.status === "live")
    .flatMap((t) =>
      t.rounds.flatMap((r) =>
        r.ties
          .filter((x) => x.winner === null && x.firstKickoff && Date.parse(x.firstKickoff) < week)
          .map((x) => ({
            what: `${t.name} · ${r.name} · ${x.teamA} v ${x.teamB}`,
            kickoff: x.firstKickoff!,
            checkAt: new Date(due(x.firstKickoff!)).toISOString(),
          })),
      ),
    ),
].sort((a, b) => a.kickoff.localeCompare(b.kickoff));

const report = {
  valid: problems.length === 0,
  problems,
  version: feed.version,
  updatedAt: feed.updatedAt,
  needsResult,
  needsFirstGoal,
  tiesToCheck,
  emptyRounds,
  upcoming,
  standingsAsOf: feed.standings.asOf,
  nothingToDo: needsResult.length === 0 && tiesToCheck.length === 0,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Feed v${feed.version} (updated ${feed.updatedAt}) — ${report.valid ? "valid" : "INVALID"}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(`Atlanta results needed: ${needsResult.length ? needsResult.map((m) => m.id).join(", ") : "none"}`);
  console.log(`Tournament matchups to check: ${tiesToCheck.length ? tiesToCheck.map((t) => `${t.tie} (${t.teams})`).join(", ") : "none"}`);
  console.log(`Rounds with no matchups yet: ${emptyRounds.length ? emptyRounds.map((r) => r.round).join(", ") : "none"}`);
  console.log(`Standings as of: ${feed.standings.asOf ?? "never"}`);
  console.log("Upcoming (next 7 days):");
  for (const u of upcoming) console.log(`  ${u.kickoff}  ${u.what}  → check at ${u.checkAt}`);
}
process.exit(problems.length ? 1 : 0);
