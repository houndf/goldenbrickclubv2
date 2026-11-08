import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { requireAdmin } from "@/lib/player";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { formatEastern, isoToEasternLocal } from "@/lib/time";
import { roundState } from "@/lib/tournament";
import { getTournamentDetail, getTournaments } from "@/lib/tournamentData";
import ui from "@/components/ui.module.css";
import {
  addTieAction,
  finishTournamentAction,
  removeTieAction,
  reopenTournamentAction,
  saveRoundAction,
  setTieResultAction,
  setTournamentStatusAction,
} from "./actions";
import { CreateTournamentForm } from "./CreateTournamentForm";

export const instant = false;
export const metadata = { title: "Admin · Cups · Golden Brick Club" };

export default async function AdminCupPage({ searchParams }: PageProps<"/admin/cup">) {
  await requireAdmin();
  const [{ t }, tournaments] = await Promise.all([searchParams, getTournaments()]);
  const selected =
    tournaments.find((x) => x.id === Number(t)) ?? tournaments.find((x) => x.status !== "final") ?? null;
  const detail = selected ? await getTournamentDetail(selected.id) : null;

  const supabase = await createSupabaseServerClient();
  const { data: teams } = await supabase.from("teams").select("id, code, name").order("name");

  // How many players picked each matchup. Counted with the server key because the
  // admin's own session can't see other players' picks until the matchup locks,
  // and a matchup with picks mustn't look empty (or it could be removed).
  const pickCounts = new Map<number, number>();
  if (detail && detail.ties.length > 0) {
    const { data: rows } = await createSupabaseAdminClient()
      .from("tournament_picks")
      .select("tie_id")
      .in(
        "tie_id",
        detail.ties.map((x) => x.id),
      );
    for (const r of rows ?? []) pickCounts.set(r.tie_id, (pickCounts.get(r.tie_id) ?? 0) + 1);
  }

  return (
    <main className={`${ui.screen} ${ui.wide}`}>
      <div className={ui.topBar}>
        <BackButton href="/admin" label="Back to admin" />
        <h1 className={ui.screenTitle}>CUPS</h1>
      </div>

      {tournaments.length > 0 && (
        <nav style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }} aria-label="Tournaments">
          {tournaments.map((x) => (
            <Link
              key={x.id}
              href={`/admin/cup?t=${x.id}`}
              className={`${ui.button} ${ui.small} ${x.id === selected?.id ? ui.primary : ui.secondary}`}
              aria-current={x.id === selected?.id ? "page" : undefined}
            >
              {x.name} · {x.status.toUpperCase()}
            </Link>
          ))}
          <Link href="/admin/cup?t=new" className={`${ui.button} ${ui.small} ${ui.secondary}`}>
            + NEW
          </Link>
        </nav>
      )}

      {(!selected || t === "new") && (
        <section className={ui.panel} aria-labelledby="new-t">
          <h2 id="new-t" className={ui.sectionTitle}>
            New tournament
          </h2>
          <CreateTournamentForm />
        </section>
      )}

      {selected && detail && t !== "new" && (
        <>
          <section className={ui.panel}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <h2 className={ui.sectionTitle}>{selected.name}</h2>
                <p className={ui.lead} style={{ fontSize: "0.8125rem" }}>
                  Trophy: {selected.trophyName} ·{" "}
                  {selected.status === "live"
                    ? "Live: the Cup tab is showing for everyone."
                    : selected.status === "final"
                      ? "Finished."
                      : "In setup: players can't see it yet."}
                </p>
              </div>
              {selected.status === "setup" && (
                <form action={setTournamentStatusAction}>
                  <input type="hidden" name="id" value={selected.id} />
                  <input type="hidden" name="status" value="live" />
                  <button type="submit" className={`${ui.button} ${ui.primary} ${ui.small}`}>
                    GO LIVE
                  </button>
                </form>
              )}
              {selected.status === "live" && (
                <>
                  <form action={setTournamentStatusAction}>
                    <input type="hidden" name="id" value={selected.id} />
                    <input type="hidden" name="status" value="setup" />
                    <button type="submit" className={`${ui.button} ${ui.secondary} ${ui.small}`}>
                      HIDE (BACK TO SETUP)
                    </button>
                  </form>
                  <form action={finishTournamentAction}>
                    <input type="hidden" name="id" value={selected.id} />
                    <button type="submit" className={`${ui.button} ${ui.primary} ${ui.small}`}>
                      FINISH &amp; CROWN ORACLE
                    </button>
                  </form>
                </>
              )}
              {selected.status === "final" && (
                <form action={reopenTournamentAction}>
                  <input type="hidden" name="id" value={selected.id} />
                  <button type="submit" className={`${ui.button} ${ui.secondary} ${ui.small}`}>
                    REOPEN
                  </button>
                </form>
              )}
            </div>
          </section>

          {detail.rounds.map((round) => {
            const roundTies = detail.ties.filter((x) => x.roundId === round.id);
            const state = roundState(round, detail.ties);
            const pickCount = (tieId: number) => pickCounts.get(tieId) ?? 0;
            return (
              <section key={round.id} className={ui.panel} aria-labelledby={`round-${round.id}`}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                  <h2 id={`round-${round.id}`} className={ui.sectionTitle}>
                    {round.number}. {round.name}
                    {round.isFinal ? " (final)" : ""}
                  </h2>
                  <span>
                    <span className={ui.tag} style={{ background: "var(--teal)" }}>
                      {round.points} PT{round.points === 1 ? "" : "S"} EACH
                    </span>
                    <span className={ui.tag}>{state.toUpperCase()}</span>
                  </span>
                </div>

                <form action={saveRoundAction} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <input type="hidden" name="roundId" value={round.id} />
                  <div className={ui.field} style={{ flex: "1 1 160px" }}>
                    <label className={ui.label} htmlFor={`name-${round.id}`}>
                      Round name
                    </label>
                    <input id={`name-${round.id}`} name="name" className={ui.input} defaultValue={round.name} maxLength={40} />
                  </div>
                  <div className={ui.field} style={{ flex: "1 1 200px" }}>
                    <label className={ui.label} htmlFor={`locks-${round.id}`}>
                      Round start (Eastern), used when a matchup has no kickoff
                    </label>
                    <input
                      id={`locks-${round.id}`}
                      name="locksAt"
                      type="datetime-local"
                      className={ui.input}
                      defaultValue={isoToEasternLocal(round.locksAt)}
                    />
                  </div>
                  <button type="submit" className={`${ui.button} ${ui.secondary} ${ui.small}`}>
                    SAVE
                  </button>
                </form>
                {round.locksAt && (
                  <p className={ui.lead} style={{ fontSize: "0.8125rem" }}>
                    Round starts {formatEastern(round.locksAt)} ET · each matchup locks 1 hour before its kickoff
                  </p>
                )}

                <ul className={ui.list}>
                  {roundTies.map((tie) => (
                    <li key={tie.id} className={ui.row}>
                      <div className={ui.rowMain}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem" }}>
                          {tie.label ? `${tie.label} · ` : ""}
                          {tie.seedA != null ? `(${tie.seedA}) ` : ""}
                          {tie.teamA.code} vs {tie.seedB != null ? `(${tie.seedB}) ` : ""}
                          {tie.teamB.code}
                        </span>
                        <span className={ui.muted} style={{ fontSize: "0.75rem" }}>
                          {pickCount(tie.id)} picks
                          {tie.winner ? ` · ${tie.winner === "home" ? tie.teamA.code : tie.teamB.code} advanced` : " · no result yet"}
                        </span>
                      </div>
                      <form action={setTieResultAction} className={ui.rowActions} style={{ alignItems: "center" }}>
                        <input type="hidden" name="tieId" value={tie.id} />
                        {round.isFinal && (
                          <label className={ui.check} style={{ fontSize: "0.8125rem" }}>
                            Total goals
                            <input
                              name="totalGoals"
                              type="number"
                              min={0}
                              max={30}
                              defaultValue={tie.totalGoals ?? ""}
                              className={ui.input}
                              style={{ width: "4.5rem", minHeight: "2.75rem", height: "2.75rem" }}
                            />
                          </label>
                        )}
                        <button name="winner" value="home" type="submit" className={`${ui.button} ${ui.small} ${tie.winner === "home" ? ui.primary : ui.secondary}`}>
                          {tie.teamA.code} WON
                        </button>
                        <button name="winner" value="away" type="submit" className={`${ui.button} ${ui.small} ${tie.winner === "away" ? ui.primary : ui.secondary}`}>
                          {tie.teamB.code} WON
                        </button>
                        {tie.winner && (
                          <button name="winner" value="" type="submit" className={`${ui.button} ${ui.small} ${ui.secondary}`}>
                            CLEAR
                          </button>
                        )}
                      </form>
                      {!tie.winner && pickCount(tie.id) === 0 && (
                        <form action={removeTieAction}>
                          <input type="hidden" name="tieId" value={tie.id} />
                          <button type="submit" className={`${ui.button} ${ui.danger} ${ui.small}`}>
                            REMOVE
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>

                {(!round.isFinal || roundTies.length === 0) && (
                  <details>
                    <summary className={ui.textLink} style={{ display: "inline-block" }}>
                      + Add a matchup
                    </summary>
                    <form action={addTieAction} className={ui.form} style={{ marginTop: "0.625rem" }}>
                      <input type="hidden" name="roundId" value={round.id} />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
                        <TeamSelect id={`a-${round.id}`} name="teamA" label="Team A (home / higher seed)" teams={teams ?? []} />
                        <TeamSelect id={`b-${round.id}`} name="teamB" label="Team B" teams={teams ?? []} />
                        <div className={ui.field}>
                          <label className={ui.label} htmlFor={`sa-${round.id}`}>
                            Seed A
                          </label>
                          <input id={`sa-${round.id}`} name="seedA" type="number" min={1} max={20} className={ui.input} />
                        </div>
                        <div className={ui.field}>
                          <label className={ui.label} htmlFor={`sb-${round.id}`}>
                            Seed B
                          </label>
                          <input id={`sb-${round.id}`} name="seedB" type="number" min={1} max={20} className={ui.input} />
                        </div>
                      </div>
                      <div className={ui.field}>
                        <label className={ui.label} htmlFor={`ko-${round.id}`}>
                          First kickoff (Eastern) · picks lock 1 hour before
                        </label>
                        <input id={`ko-${round.id}`} name="kickoff" type="datetime-local" className={ui.input} />
                      </div>
                      <div className={ui.field}>
                        <label className={ui.label} htmlFor={`lbl-${round.id}`}>
                          Label (optional)
                        </label>
                        <input id={`lbl-${round.id}`} name="label" className={ui.input} placeholder="EAST or WEST" maxLength={12} />
                      </div>
                      <button type="submit" className={`${ui.button} ${ui.secondary}`} style={{ fontSize: "1.25rem" }}>
                        ADD MATCHUP
                      </button>
                    </form>
                  </details>
                )}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}

function TeamSelect({
  id,
  name,
  label,
  teams,
}: {
  id: string;
  name: string;
  label: string;
  teams: { id: number; code: string; name: string }[];
}) {
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {label}
      </label>
      <select id={id} name={name} className={ui.select} required defaultValue="">
        <option value="" disabled>
          Choose a team
        </option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name} ({team.code})
          </option>
        ))}
      </select>
    </div>
  );
}
