import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { requireAdmin } from "@/lib/player";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatEastern, isoToEasternLocal } from "@/lib/time";
import ui from "@/components/ui.module.css";
import styles from "../../data.module.css";
import { saveTiePickAdminAction, saveTieResultAction } from "../../actions";

export const instant = false;
export const metadata = { title: "Admin · Edit matchup · Golden Brick Club" };

type TeamRef = { code: string; name: string } | null;

export default async function AdminTiePage({ params, searchParams }: PageProps<"/admin/data/tie/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const saved = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const db = createSupabaseAdminClient();

  const { data: tie } = await db
    .from("tournament_ties")
    .select(
      "id, label, seed_a, seed_b, winner, total_goals, first_kickoff, round:tournament_rounds(name, points, is_final, locks_at, tournament_id), team_a:teams!tournament_ties_team_a_id_fkey(code, name), team_b:teams!tournament_ties_team_b_id_fkey(code, name)",
    )
    .eq("id", Number(id))
    .maybeSingle();
  if (!tie) notFound();
  const a = tie.team_a as unknown as TeamRef;
  const b = tie.team_b as unknown as TeamRef;
  const round = tie.round as unknown as { name: string; points: number; is_final: boolean; locks_at: string | null; tournament_id: number };
  const lockBase = tie.first_kickoff ?? round.locks_at;
  const lock = lockBase ? new Date(Date.parse(lockBase) - 60 * 60_000).toISOString() : null;

  const [{ data: players }, { data: picks }] = await Promise.all([
    db.from("profiles").select("id, username").order("username"),
    db.from("tournament_picks").select("player_id, pick, total_goals").eq("tie_id", tie.id),
  ]);
  const byPlayer = new Map((picks ?? []).map((p) => [p.player_id, p]));

  return (
    <main className={`${ui.screen} ${ui.wide}`}>
      <div className={ui.topBar}>
        <BackButton href={`/admin/data?view=cup&t=${round.tournament_id}`} label="Back to matchups" />
        <h1 className={ui.screenTitle}>
          {a?.code} v {b?.code}
        </h1>
      </div>
      <p className={ui.lead} style={{ fontSize: "0.875rem" }}>
        {round.name}
        {tie.label ? ` · ${tie.label}` : ""} · worth {round.points} · {lock ? `picks lock ${formatEastern(lock)} ET` : "no kickoff set"}
      </p>
      {error && (
        <p role="alert" className={`${styles.flashError} ${ui.span}`}>
          {error}
        </p>
      )}
      {saved === "result" && <p className={`${styles.flash} ${ui.span}`}>✓ Result saved</p>}

      <section className={ui.panel} aria-labelledby="result">
        <h2 id="result" className={ui.sectionTitle}>
          Result
        </h2>
        <form action={saveTieResultAction} className={ui.form}>
          <input type="hidden" name="tieId" value={tie.id} />
          <div className={styles.fields}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="winner">
                Went through
              </label>
              <select id="winner" name="winner" className={ui.select} defaultValue={tie.winner ?? ""}>
                <option value="">Not decided yet</option>
                <option value="home">{a?.name}</option>
                <option value="away">{b?.name}</option>
              </select>
            </div>
            {round.is_final && (
              <div className={ui.field}>
                <label className={ui.label} htmlFor="totalGoals">
                  Total goals (tie-breaker)
                </label>
                <input id="totalGoals" name="totalGoals" type="number" min={0} max={30} className={ui.input} defaultValue={tie.total_goals ?? ""} />
              </div>
            )}
            <div className={ui.field}>
              <label className={ui.label} htmlFor="kickoff">
                First kickoff (Eastern)
              </label>
              <input id="kickoff" name="kickoff" type="datetime-local" className={ui.input} defaultValue={isoToEasternLocal(tie.first_kickoff)} />
            </div>
          </div>
          <button type="submit" className={`${ui.button} ${ui.primary}`}>
            SAVE RESULT
          </button>
        </form>
      </section>

      <section className={`${ui.panel} ${ui.span}`} aria-labelledby="preds">
        <h2 id="preds" className={ui.sectionTitle}>
          Predictions
        </h2>
        <p className={ui.muted} style={{ fontSize: "0.8125rem", margin: 0 }}>
          Choose a team and SAVE; set it to — or press CLEAR to remove a pick.
        </p>
        <ul className={ui.list}>
          {(players ?? []).map((pl) => {
            const p = byPlayer.get(pl.id);
            const pts = p && tie.winner ? (p.pick === tie.winner ? round.points : 0) : null;
            return (
              <li key={pl.id}>
                <form action={saveTiePickAdminAction} className={`${styles.editRow} ${saved === `p${pl.id}` ? styles.editRowSaved : ""}`}>
                  <input type="hidden" name="tieId" value={tie.id} />
                  <input type="hidden" name="playerId" value={pl.id} />
                  <span className={styles.who}>
                    {pl.username}
                    <small>{saved === `p${pl.id}` ? "✓ saved" : p ? "" : "no pick"}</small>
                  </span>
                  <select name="pick" className={`${ui.select} ${styles.sel}`} defaultValue={p?.pick ?? ""} aria-label={`${pl.username}: who goes through`}>
                    <option value="">—</option>
                    <option value="home">{a?.code}</option>
                    <option value="away">{b?.code}</option>
                  </select>
                  {round.is_final && (
                    <input
                      name="totalGoals"
                      type="number"
                      min={0}
                      max={30}
                      placeholder="goals"
                      className={`${ui.input} ${styles.num}`}
                      defaultValue={p?.total_goals ?? ""}
                      aria-label={`${pl.username}: total goals guess`}
                    />
                  )}
                  <span className={styles.pts} title="Points for this matchup">
                    {pts == null ? "" : pts > 0 ? `+${pts}` : "0"}
                  </span>
                  <button type="submit" className={`${ui.button} ${ui.small} ${ui.primary}`}>
                    SAVE
                  </button>
                  {p && (
                    <button type="submit" name="clear" value="1" className={`${ui.button} ${ui.small} ${ui.secondary}`}>
                      CLEAR
                    </button>
                  )}
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
