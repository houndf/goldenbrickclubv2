# Results feed: instructions for the scheduled task

The app gets results from `data/feed.json` in this repo. A scheduled Claude task
keeps it up to date. Every push to `main` redeploys the site on Vercel, and the
app imports the new feed version into the database automatically.

**Scope:** Atlanta United only (every match: kickoff, result, who scored first),
plus MLS standings, plus any live tournament (currently the MLS Cup Playoffs).
Other teams' regular-season matches are not tracked.

## Every run

1. Work in a fresh clone of `houndf/goldenbrickclubv2` (attach it with push access),
   then `npm ci`.
2. `npm run feed:status` — read the report. **If it says nothing needs a result and
   your run type (below) has nothing else to do, stop without committing.**
3. Research only what's needed, from at least two reliable sources (mlssoccer.com,
   ESPN, AP, the clubs' sites). If sources disagree or a match isn't confirmed
   final, leave it as it is.
4. Edit `data/feed.json` (format: `src/lib/feed.ts`). Bump `version` by 1 and set
   `updatedAt`. Never change a match `id` or tie `key` that already exists.
5. `npm run feed:status` must say **valid**. Fix problems until it does.
6. Commit only `data/feed.json` with a message like
   `Feed v12: ATL 2–1 NSH (ATL scored first)` and push to `main`.

## What to record

- **Atlanta matches** (`atlanta.matches`): ids `ATL<yy>-<nn>` in kickoff order
  (`ATL27-01`, …). Kickoff as ISO with offset. When final: both scores and
  `firstGoal` (`home`/`away`; `null` only for 0–0). Postponed → `"postponed"` and
  the new kickoff once known.
- **New season schedule:** when the next season's Atlanta schedule is published,
  set `atlanta.season` to the new year and replace `atlanta.matches` with the new
  season's matches (all `scheduled`). The previous season is already in the database.
- **Standings** (`standings`): all MLS teams, both conferences, with `asOf`.
  Update after each matchday that involves Atlanta or a tracked opponent, and at
  least weekly during the season. `form` = last five results, newest first.
- **Tournaments:** one entry per tournament, e.g. key `mls-cup-playoffs-2026`,
  name `MLS Cup Playoffs 2026`, trophyName `MLS Cup Playoffs 2026 Oracle`.
  - `rounds`: every round first to last (they're worth 1, 2, 3… points). For the
    MLS Cup Playoffs: Wild Card, Round One, Conference Semifinals, Conference
    Finals, MLS Cup. Add a round's `ties` as soon as its matchups are known.
  - Each tie: `teamA` = higher seed / home team, `teamB` = the other; seeds;
    label `EAST`/`WEST` (none for the final); `firstKickoff` = kickoff of the
    first game of that matchup. Each matchup's picks lock **1 hour before** its
    `firstKickoff`, so fill it in as soon as the date and time are announced —
    a matchup without one can't be picked yet. Keep the seeds right: the app
    draws the bracket from them (Round One order 1v8/9, 4v5, 2v7, 3v6).
  - `winner` = `a` or `b` once the team **advanced** (best-of-3 series, extra time
    and shootouts all count — record who goes through).
  - Final only: `totalGoals` = goals in the final including extra time,
    excluding the shootout.
  - When the final is decided, set the tournament `status` to `final`.

## Timing (handled by the scheduled tasks)

- A match is "due" about 2 h 10 min after kickoff (115 min of play + 15 min).
  `feed:status` lists due matches and the next week's kickoffs with their check times.
- **Planner run (daily):** run `feed:status`. Then:
  - fill in anything due or missing (results, empty rounds whose matchups are now
    known, a new season schedule, standings if older than 7 days in season);
  - for each kickoff in the next 24 hours, create a one-off follow-up check at its
    `checkAt` time, unless one already exists for that time.
- **Follow-up run (one-off):** check the one match. If it's final, record it and
  stop. If it's still being played, schedule another one-off check 15 minutes
  later (at most 8 retries in total).
