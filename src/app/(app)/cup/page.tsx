import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { HiddenResultsBanner, HiddenResultsCard } from "@/components/HiddenResults";
import { requirePlayer } from "@/lib/player";
import { getLeagueSettings } from "@/lib/settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatEastern, timeUntil } from "@/lib/time";
import { roundState, tournamentStandings, type RoundState, type Side } from "@/lib/tournament";
import { getLiveTournament, getOracleWins, getTournamentDetail, getTournaments } from "@/lib/tournamentData";
import { isGoldView } from "@/lib/view";
import ui from "@/components/ui.module.css";
import styles from "./cup.module.css";
import { RoundPickForm } from "./RoundPickForm";

export const instant = false;
export const metadata = { title: "Cup · Golden Brick Club" };

const stateLabel: Record<RoundState, string> = { setup: "SOON", open: "PICK NOW", locked: "LOCKED", done: "DONE" };

export default async function CupPage({ searchParams }: PageProps<"/cup">) {
  const player = await requirePlayer();
  const [goldOnly, settings, live, all, oracles, params] = await Promise.all([
    isGoldView(player),
    getLeagueSettings(),
    getLiveTournament(),
    getTournaments(),
    getOracleWins(),
    searchParams,
  ]);
  const isAdmin = player.role === "admin";
  const hideResults = settings.resultsHidden && !isAdmin;
  const cabinet = all.filter((t) => t.status === "final");

  const supabase = await createSupabaseServerClient();
  const { data: profiles } = await supabase.from("profiles").select("id, username, initials, avatar_color, extra_gold");
  const people = new Map((profiles ?? []).map((p) => [p.id, p]));

  const detail = live ? await getTournamentDetail(live.id) : null;

  return (
    <main className={ui.screen}>
      <h1 className={ui.bigTitle} style={{ fontSize: 40 }}>
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
          selectedRound={Number(params.round) || null}
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
                  <span style={{ fontSize: 28 }} aria-hidden="true">
                    🔮
                  </span>
                  <div className={ui.rowMain}>
                    <span style={{ fontWeight: 900 }}>{t.trophyName}</span>
                    <span className={ui.muted} style={{ fontSize: 13 }}>
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
  selectedRound,
  people,
  goldOnly,
  hideResults,
  showAdminBanner,
  oracles,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getTournamentDetail>>>;
  playerId: string;
  selectedRound: number | null;
  people: Map<string, Person>;
  goldOnly: boolean;
  hideResults: boolean;
  showAdminBanner: boolean;
  oracles: Record<string, string[]>;
}) {
  const { meta, rounds, ties, picks } = detail;
  const now = new Date();
  const states = new Map(rounds.map((r) => [r.id, roundState(r, ties, now)]));
  const fallback =
    rounds.find((r) => states.get(r.id) === "open") ??
    [...rounds].reverse().find((r) => states.get(r.id) !== "setup") ??
    rounds[0];
  const round = rounds.find((r) => r.number === selectedRound) ?? fallback;

  const playerIds = [...people.values()].filter((p) => !goldOnly || p.extra_gold).map((p) => p.id);
  const standings = tournamentStandings(rounds, ties, picks, playerIds, (id) => people.get(id)?.username ?? id);
  const leader = standings[0];
  const anyScored = ties.some((t) => t.winner);
  const me = standings.find((s) => s.playerId === playerId);

  const roundTies = round ? ties.filter((t) => t.roundId === round.id) : [];
  const myPicks: Record<number, Side> = {};
  let myGoals: number | null = null;
  for (const p of picks) {
    if (p.playerId !== playerId) continue;
    myPicks[p.tieId] = p.pick;
    if (round?.isFinal && roundTies.some((t) => t.id === p.tieId)) myGoals = p.totalGoals;
  }
  const state = round ? states.get(round.id)! : "setup";

  return (
    <>
      <section className={styles.hero}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span className={styles.heroKicker}>LIVE NOW</span>
          {round?.locksAt && state === "open" && (
            <span style={{ background: "var(--ink)", color: "var(--gold)", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 900 }}>
              LOCKS IN {timeUntil(round.locksAt, now).toUpperCase()}
            </span>
          )}
        </div>
        <h2 className={styles.heroTitle}>{meta.name.toUpperCase()}</h2>
        <nav className={styles.rounds} aria-label="Rounds">
          {rounds.map((r) => {
            const s = states.get(r.id)!;
            const cls = [
              styles.roundChip,
              s === "done" ? styles.chipDone : s === "open" ? styles.chipOpen : "",
              r.id === round?.id ? styles.chipSelected : "",
            ].join(" ");
            return (
              <Link key={r.id} href={`/cup?round=${r.number}`} className={cls} aria-current={r.id === round?.id ? "page" : undefined}>
                <span className={styles.roundChipName}>{r.name}</span>
                <span className={styles.roundChipState}>{stateLabel[s]}</span>
              </Link>
            );
          })}
        </nav>
        {me && !hideResults && (
          <span style={{ fontSize: 13, fontWeight: 900, color: "var(--red-soft-text)" }}>
            You: #{me.rank} · {me.points} pts{goldOnly ? " among gold members" : ""}
          </span>
        )}
      </section>

      {round && (
        <section className={ui.panel} aria-labelledby="round-heading">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <h2 id="round-heading" className={ui.sectionTitle}>
              {round.name}
            </h2>
            <span className={ui.tag} style={{ background: "var(--teal)" }}>
              +{round.points} EACH
            </span>
          </div>
          {round.locksAt && (
            <p className={ui.lead} style={{ fontSize: 13 }}>
              {state === "open" ? "Picks lock" : "Locked"} {formatEastern(round.locksAt)} ET
            </p>
          )}

          {state === "setup" && <p className={ui.lead}>Matchups for this round aren&apos;t set yet.</p>}

          {state === "open" && (
            <RoundPickForm
              roundId={round.id}
              points={round.points}
              isFinal={round.isFinal}
              ties={roundTies}
              initialPicks={myPicks}
              initialGoals={myGoals}
            />
          )}

          {(state === "locked" || state === "done") && (
            <ul className={ui.list}>
              {roundTies.map((tie) => {
                const mine = myPicks[tie.id];
                const verdict = !mine ? "MISSED" : !tie.winner ? "WAITING" : tie.winner === mine ? `+${round.points}` : "0";
                const vClass = !mine || (tie.winner && tie.winner !== mine) ? styles.wrong : !tie.winner ? styles.pending : styles.right;
                return (
                  <li key={tie.id} className={styles.resultRow}>
                    <div>
                      <div className={styles.resultTeams}>
                        <span className={tie.winner === "home" ? styles.winnerMark : undefined}>{tie.teamA.code}</span>
                        {" vs "}
                        <span className={tie.winner === "away" ? styles.winnerMark : undefined}>{tie.teamB.code}</span>
                      </div>
                      <div className={ui.muted} style={{ fontSize: 12 }}>
                        You picked {mine ? (mine === "home" ? tie.teamA.code : tie.teamB.code) : "nothing"}
                        {tie.winner ? ` · ${tie.winner === "home" ? tie.teamA.code : tie.teamB.code} went through` : ""}
                      </div>
                    </div>
                    <span className={`${styles.verdict} ${vClass}`}>{verdict}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {showAdminBanner && <HiddenResultsBanner />}
      {hideResults ? (
        <HiddenResultsCard />
      ) : (
        <section className={ui.panel} aria-labelledby="oracle-race">
          <h2 id="oracle-race" className={ui.sectionTitle}>
            Oracle race {goldOnly ? "· gold only" : ""}
          </h2>
          {anyScored && leader ? (
            <p className={ui.lead} style={{ fontSize: 14 }}>
              Current {meta.trophyName}: <strong style={{ color: "var(--text)" }}>{people.get(leader.playerId)?.username}</strong> ·{" "}
              {leader.points} pts
            </p>
          ) : (
            <p className={ui.lead} style={{ fontSize: 14 }}>
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
        </section>
      )}
    </>
  );
}
