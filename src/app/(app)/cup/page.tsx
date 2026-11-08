import { Avatar } from "@/components/Avatar";
import { HiddenResultsBanner, HiddenResultsCard } from "@/components/HiddenResults";
import { requirePlayer } from "@/lib/player";
import { timeUntil } from "@/lib/time";
import { getLeagueSettings } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Conference } from "@/lib/bracket";
import { tieLockAt, tieState, tournamentStandings, type TTeam } from "@/lib/tournament";
import { getLiveTournament, getOracleWins, getTournamentDetail, getTournaments } from "@/lib/tournamentData";
import { isGoldView } from "@/lib/view";
import ui from "@/components/ui.module.css";
import styles from "./cup.module.css";
import { BracketView, type CrowdPerson, type MyPick } from "./BracketView";
import { CupHelp } from "./CupHelp";

export const instant = false;
export const metadata = { title: "Cup · Golden Brick Club" };

export default async function CupPage() {
  const player = await requirePlayer();
  const [goldOnly, settings, live, all, oracles] = await Promise.all([
    isGoldView(player),
    getLeagueSettings(),
    getLiveTournament(),
    getTournaments(),
    getOracleWins(),
  ]);
  const isAdmin = player.role === "admin";
  const hideResults = settings.resultsHidden && !isAdmin;
  const cabinet = all.filter((t) => t.status === "final");

  const supabase = await createSupabaseServerClient();
  const { data: profiles } = await supabase.from("profiles").select("id, username, initials, avatar_color, extra_gold");
  const people = new Map((profiles ?? []).map((p) => [p.id, p]));

  const detail = live ? await getTournamentDetail(live.id) : null;

  // Top seeds, so the not-yet-set 1-seed games can show who's waiting.
  const topSeeds: Partial<Record<Conference, TTeam>> = {};
  if (detail) {
    const { data: tops } = await supabase
      .from("team_standings")
      .select("conference, season_id, team:teams(code, name)")
      .eq("rank", 1)
      .order("season_id", { ascending: false })
      .limit(2);
    for (const row of (tops ?? []) as unknown as { conference: string; team: TTeam | null }[]) {
      const conf = row.conference.toUpperCase() as Conference;
      if (row.team && !topSeeds[conf]) topSeeds[conf] = row.team;
    }
  }

  return (
    <main className={ui.screen}>
      <h1 className={ui.bigTitle} style={{ fontSize: "2.5rem" }}>
        CUP
      </h1>

      {!detail ? (
        <section className={ui.panel}>
          <h2 className={ui.sectionTitle}>No tournament right now</h2>
          <p className={ui.lead}>When the commissioner starts one, this is where you&apos;ll pick each round.</p>
        </section>
      ) : (
        <TournamentView
          detail={detail}
          playerId={player.id}
          topSeeds={topSeeds}
          people={people}
          goldOnly={goldOnly}
          hideResults={hideResults}
          showAdminBanner={settings.resultsHidden && isAdmin}
          oracles={oracles}
        />
      )}

      {cabinet.length > 0 && (
        <section className={ui.panel} aria-labelledby="cabinet">
          <h2 id="cabinet" className={ui.sectionTitle}>
            Trophy cabinet
          </h2>
          <ul className={ui.list}>
            {cabinet.map((t) => {
              const winner = t.oracleProfileId ? people.get(t.oracleProfileId) : undefined;
              return (
                <li key={t.id} className={ui.row}>
                  <span style={{ fontSize: "1.75rem" }} aria-hidden="true">
                    🔮
                  </span>
                  <div className={ui.rowMain}>
                    <span style={{ fontWeight: 900 }}>{t.trophyName}</span>
                    <span className={ui.muted} style={{ fontSize: "0.8125rem" }}>
                      {hideResults ? "Winner hidden" : (winner?.username ?? "No winner")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

type Person = { id: string; username: string; initials: string; avatar_color: string; extra_gold: boolean };

function TournamentView({
  detail,
  playerId,
  topSeeds,
  people,
  goldOnly,
  hideResults,
  showAdminBanner,
  oracles,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getTournamentDetail>>>;
  playerId: string;
  topSeeds: Partial<Record<Conference, TTeam>>;
  people: Map<string, Person>;
  goldOnly: boolean;
  hideResults: boolean;
  showAdminBanner: boolean;
  oracles: Record<string, string[]>;
}) {
  const { meta, rounds, ties, picks } = detail;
  const now = new Date();
  const roundOf = new Map(rounds.map((r) => [r.id, r]));

  const playerIds = [...people.values()].filter((p) => !goldOnly || p.extra_gold).map((p) => p.id);
  const visible = new Set(playerIds);
  const standings = tournamentStandings(rounds, ties, picks, playerIds, (id) => people.get(id)?.username ?? id);
  const leader = standings[0];
  const anyScored = ties.some((t) => t.winner);
  const me = standings.find((s) => s.playerId === playerId);

  const myPicks: Record<number, MyPick> = {};
  const crowd: Record<number, { home: CrowdPerson[]; away: CrowdPerson[] }> = {};
  const tieById = new Map(ties.map((t) => [t.id, t]));
  for (const p of picks) {
    if (p.playerId === playerId) myPicks[p.tieId] = { pick: p.pick, totalGoals: p.totalGoals };
    const tie = tieById.get(p.tieId);
    const round = tie ? roundOf.get(tie.roundId) : undefined;
    const person = people.get(p.playerId);
    // Everyone's picks show once a matchup locks.
    if (!tie || !round || !person || !visible.has(p.playerId) || tieState(tie, round, now) === "open") continue;
    const entry = (crowd[p.tieId] ??= { home: [], away: [] });
    entry[p.pick].push({ id: person.id, username: person.username, initials: person.initials, color: person.avatar_color });
  }

  // Soonest lock among matchups still waiting on my pick.
  const nextLock = ties
    .filter((t) => !myPicks[t.id] && roundOf.has(t.roundId) && tieState(t, roundOf.get(t.roundId)!, now) === "open")
    .map((t) => tieLockAt(t, roundOf.get(t.roundId)!)!)
    .sort()[0];

  return (
    <>
      <section className={`${styles.hero} ${ui.span}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <span className={styles.heroKicker}>LIVE NOW</span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {nextLock && (
              <span style={{ background: "var(--ink)", color: "var(--gold)", borderRadius: "0.5rem", padding: "2px 8px", fontSize: "0.6875rem", fontWeight: 900 }}>
                NEXT LOCK IN {timeUntil(nextLock, now).toUpperCase()}
              </span>
            )}
            <CupHelp>
              <ul className={styles.helpList}>
                <li>
                  <strong>Pick who goes through</strong> each matchup. Tap a glowing card on the bracket.
                </li>
                <li>
                  <strong>Right pick = the round&apos;s points:</strong>{" "}
                  {rounds.map((r) => `${r.name} ${r.points}`).join(" · ")}.
                </li>
                <li>
                  <strong>Wrong or missed = 0.</strong> You can never lose points.
                </li>
                <li>
                  <strong>Locks 1 hour before kickoff.</strong> Change your pick as often as you like until then.
                </li>
                <li>
                  <strong>Everyone&apos;s picks show</strong> once a matchup locks.
                </li>
                <li>
                  <strong>Tie-breaker:</strong> guess the total goals in the final (extra time counts, shootouts don&apos;t). Closest wins.
                </li>
                <li>
                  <strong>Most points wins</strong> the {meta.trophyName} and a 🔮 badge.
                </li>
              </ul>
            </CupHelp>
          </span>
        </div>
        <h2 className={styles.heroTitle}>{meta.name.toUpperCase()}</h2>
        <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 800, color: "var(--red-soft-text)" }}>
          Pick who goes through each matchup. Right picks earn the round&apos;s number in points. Each matchup locks 1 hour before
          kickoff.
        </p>
        <div className={styles.heroFoot}>
          {me && !hideResults ? (
            <span style={{ fontSize: "0.8125rem", fontWeight: 900, color: "var(--red-soft-text)" }}>
              You: #{me.rank} · {me.points} pts{goldOnly ? " among gold members" : ""}
            </span>
          ) : (
            <span />
          )}
          <a href="#bracket" className={styles.predictButton}>
            PREDICT
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </a>
        </div>
      </section>

      {showAdminBanner && <HiddenResultsBanner />}
      {hideResults ? (
        <div className={ui.span}>
          <HiddenResultsCard />
        </div>
      ) : (
        <details className={`${ui.panel} ${ui.collapsible} ${ui.span}`} open>
          <summary className={ui.collapsibleSummary}>
            <h2 className={ui.sectionTitle}>Oracle race</h2>
            <span className={ui.muted} style={{ fontSize: "0.8125rem" }}>
              {anyScored && leader ? `${people.get(leader.playerId)?.username} leads` : `${standings.length} players`}
            </span>
            <svg className={ui.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          {anyScored && leader ? (
            <p className={ui.lead} style={{ fontSize: "0.875rem" }}>
              Current {meta.trophyName}: <strong style={{ color: "var(--text)" }}>{people.get(leader.playerId)?.username}</strong> ·{" "}
              {leader.points} pts
            </p>
          ) : (
            <p className={ui.lead} style={{ fontSize: "0.875rem" }}>
              No results yet. Ties at the end go to the closest final-goals guess.
            </p>
          )}
          <div className={styles.boardHead} style={{ ["--rounds" as string]: rounds.length }}>
            <span />
            <span />
            <span>PLAYER</span>
            {rounds.map((r) => (
              <span key={r.id} style={{ textAlign: "center" }} title={r.name}>
                R{r.number}
              </span>
            ))}
            <span style={{ textAlign: "right" }}>PTS</span>
          </div>
          <ol className={ui.list}>
            {standings.map((row, i) => {
              const person = people.get(row.playerId);
              const isMe = row.playerId === playerId;
              const cls = [styles.boardRow, i === 0 && anyScored ? styles.boardFirst : "", isMe ? styles.boardMe : ""].join(" ");
              return (
                <li key={row.playerId} className={cls} style={{ ["--rounds" as string]: rounds.length }}>
                  <span className={styles.boardRank}>{row.rank}</span>
                  <Avatar
                    initials={person?.initials ?? "?"}
                    color={person?.avatar_color}
                    size={26}
                    oracle={oracles[row.playerId]?.length ?? 0}
                  />
                  <span className={styles.boardName}>
                    {person?.username}
                    {isMe ? " (you)" : ""}
                  </span>
                  {rounds.map((r) => {
                    const v = row.byRound[r.number];
                    return (
                      <span key={r.id} className={styles.boardNum} style={v === undefined ? { opacity: 0.4 } : undefined}>
                        {v === undefined ? "–" : v}
                      </span>
                    );
                  })}
                  <span className={styles.boardPts}>{row.points}</span>
                </li>
              );
            })}
          </ol>
        </details>
      )}

      <section id="bracket" className={`${ui.panel} ${ui.span} ${styles.bracketPanel}`} aria-label="Bracket" style={{ padding: "0.75rem" }}>
        <BracketView rounds={rounds} ties={ties} topSeeds={topSeeds} initialPicks={myPicks} crowd={crowd} nowIso={now.toISOString()} />
      </section>

    </>
  );
}
