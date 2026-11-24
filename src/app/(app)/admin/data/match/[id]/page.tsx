import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { requireAdmin } from "@/lib/player";
import { legacyPoints } from "@/lib/scoring/legacy";
import { scorePick } from "@/lib/scoring/score";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatEastern, isoToEasternLocal } from "@/lib/time";
import ui from "@/components/ui.module.css";
import styles from "../../data.module.css";
import { saveLegacyPickAction, saveMatchResultAction, saveSeasonPickAction } from "../../actions";

export const instant = false;
export const metadata = { title: "Admin · Edit match · Golden Brick Club" };

type TeamRef = { code: string; name: string } | null;

export default async function AdminMatchPage({ params, searchParams }: PageProps<"/admin/data/match/[id]">) {
  await requireAdmin();
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = decodeURIComponent(rawId);
  const saved = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const db = createSupabaseAdminClient();

  const { data: m } = await db
    .from("matches")
    .select(
      "id, season_id, kickoff_at, locks_at, status, home_goals, away_goals, first_goal, result_source, season:seasons(scoring), home:teams!matches_home_team_id_fkey(code, name), away:teams!matches_away_team_id_fkey(code, name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!m) notFound();
  const home = m.home as unknown as TeamRef;
  const away = m.away as unknown as TeamRef;
  const legacy = (m.season as unknown as { scoring: string } | null)?.scoring === "legacy_exact";
  const final = m.status === "final" && m.home_goals != null && m.away_goals != null;

  return (
    <main className={`${ui.screen} ${ui.wide}`}>
      <div className={ui.topBar}>
        <BackButton href={`/admin/data?view=${m.season_id}`} label="Back to matches" />
        <h1 className={ui.screenTitle}>
          {home?.code} v {away?.code}
        </h1>
      </div>
      <p className={ui.lead} style={{ fontSize: "0.875rem" }}>
        {m.season_id} · {formatEastern(m.kickoff_at)} ET{legacy ? "" : ` · picks lock ${formatEastern(m.locks_at)} ET`}
      </p>
      {error && (
        <p role="alert" className={`${styles.flashError} ${ui.span}`}>
          {error}
        </p>
      )}
      {saved === "result" && <p className={`${styles.flash} ${ui.span}`}>✓ Result saved</p>}

      <section className={ui.panel} aria-labelledby="result">
        <h2 id="result" className={ui.sectionTitle}>
          Result {m.result_source === "admin" ? "· set by admin" : m.result_source === "api" ? "· from the feed" : ""}
        </h2>
        <form action={saveMatchResultAction} className={ui.form}>
          <input type="hidden" name="matchId" value={m.id} />
          <div className={styles.fields}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="status">
                Status
              </label>
              <select id="status" name="status" className={ui.select} defaultValue={m.status}>
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="final">Final</option>
                <option value="postponed">Postponed</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="homeGoals">
                {home?.name} goals
              </label>
              <input id="homeGoals" name="homeGoals" type="number" min={0} max={30} className={ui.input} defaultValue={m.home_goals ?? ""} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="awayGoals">
                {away?.name} goals
              </label>
              <input id="awayGoals" name="awayGoals" type="number" min={0} max={30} className={ui.input} defaultValue={m.away_goals ?? ""} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="firstGoal">
                Scored first
              </label>
              <select id="firstGoal" name="firstGoal" className={ui.select} defaultValue={m.first_goal ?? ""}>
                <option value="">Nobody / unknown</option>
                <option value="home">{home?.name}</option>
                <option value="away">{away?.name}</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="kickoff">
                Kickoff (Eastern)
              </label>
              <input id="kickoff" name="kickoff" type="datetime-local" className={ui.input} defaultValue={isoToEasternLocal(m.kickoff_at)} />
            </div>
          </div>
          <button type="submit" className={`${ui.button} ${ui.primary}`}>
            SAVE RESULT
          </button>
        </form>
      </section>

      {legacy ? (
        <LegacyPicks matchId={m.id} homeCode={home?.code ?? "H"} awayCode={away?.code ?? "A"} final={final ? { h: m.home_goals!, a: m.away_goals! } : null} saved={saved} />
      ) : (
        <SeasonPicks
          matchId={m.id}
          homeCode={home?.code ?? "H"}
          awayCode={away?.code ?? "A"}
          final={final ? { home: m.home_goals!, away: m.away_goals!, firstGoal: m.first_goal } : null}
          saved={saved}
        />
      )}
    </main>
  );
}

async function LegacyPicks({
  matchId,
  homeCode,
  awayCode,
  final,
  saved,
}: {
  matchId: string;
  homeCode: string;
  awayCode: string;
  final: { h: number; a: number } | null;
  saved: string | null;
}) {
  const db = createSupabaseAdminClient();
  const [{ data: players }, { data: picks }] = await Promise.all([
    db.from("legacy_players").select("id, name").order("name"),
    db.from("legacy_picks").select("legacy_player_id, pred_home, pred_away").eq("match_id", matchId),
  ]);
  const byPlayer = new Map((picks ?? []).map((p) => [p.legacy_player_id, p]));
  return (
    <section className={`${ui.panel} ${ui.span}`} aria-labelledby="preds">
      <h2 id="preds" className={ui.sectionTitle}>
        Predictions · exact score
      </h2>
      <p className={ui.muted} style={{ fontSize: "0.8125rem", margin: 0 }}>
        Save to add or change a prediction; CLEAR removes it.
      </p>
      <ul className={ui.list}>
        {(players ?? []).map((pl) => {
          const p = byPlayer.get(pl.id);
          const pts = p && final ? legacyPoints(p.pred_home, p.pred_away, final.h, final.a) : null;
          return (
            <li key={pl.id}>
              <form id={`row-l${pl.id}`} action={saveLegacyPickAction} className={`${styles.editRow} ${saved === `l${pl.id}` ? styles.editRowSaved : ""}`}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="legacyPlayerId" value={pl.id} />
                <span className={styles.who}>
                  {pl.name}
                  <small>{saved === `l${pl.id}` ? "✓ saved" : p ? "" : "no prediction"}</small>
                </span>
                <label className={ui.muted} style={{ fontSize: "0.75rem", fontWeight: 900 }}>
                  {homeCode}
                  <input name="predHome" type="number" min={0} max={30} className={`${ui.input} ${styles.num}`} defaultValue={p?.pred_home ?? ""} aria-label={`${pl.name}: ${homeCode} goals`} />
                </label>
                <label className={ui.muted} style={{ fontSize: "0.75rem", fontWeight: 900 }}>
                  {awayCode}
                  <input name="predAway" type="number" min={0} max={30} className={`${ui.input} ${styles.num}`} defaultValue={p?.pred_away ?? ""} aria-label={`${pl.name}: ${awayCode} goals`} />
                </label>
                <span className={styles.pts} title="Points for this match">
                  {pts == null ? "" : pts > 0 ? `+${pts}` : pts}
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
  );
}

async function SeasonPicks({
  matchId,
  homeCode,
  awayCode,
  final,
  saved,
}: {
  matchId: string;
  homeCode: string;
  awayCode: string;
  final: { home: number; away: number; firstGoal: "home" | "away" | null } | null;
  saved: string | null;
}) {
  const db = createSupabaseAdminClient();
  const [{ data: players }, { data: picks }] = await Promise.all([
    db.from("profiles").select("id, username").order("username"),
    db.from("picks").select("player_id, result, margin, first_goal").eq("match_id", matchId),
  ]);
  const byPlayer = new Map((picks ?? []).map((p) => [p.player_id, p]));
  return (
    <section className={`${ui.panel} ${ui.span}`} aria-labelledby="preds">
      <h2 id="preds" className={ui.sectionTitle}>
        Predictions
      </h2>
      <p className={ui.muted} style={{ fontSize: "0.8125rem", margin: 0 }}>
        Result, optional margin and first goal. Set the result to — or press CLEAR to remove a pick.
      </p>
      <ul className={ui.list}>
        {(players ?? []).map((pl) => {
          const p = byPlayer.get(pl.id);
          let pts: number | null = null;
          if (p && final) {
            try {
              pts = scorePick({ result: p.result, margin: p.margin, firstGoal: p.first_goal }, final).total;
            } catch {
              pts = null;
            }
          }
          return (
            <li key={pl.id}>
              <form id={`row-p${pl.id}`} action={saveSeasonPickAction} className={`${styles.editRow} ${saved === `p${pl.id}` ? styles.editRowSaved : ""}`}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="playerId" value={pl.id} />
                <span className={styles.who}>
                  {pl.username}
                  <small>{saved === `p${pl.id}` ? "✓ saved" : p ? "" : "no pick"}</small>
                </span>
                <select name="result" className={`${ui.select} ${styles.sel}`} defaultValue={p?.result ?? ""} aria-label={`${pl.username}: result`}>
                  <option value="">—</option>
                  <option value="home">{homeCode} win</option>
                  <option value="draw">Draw</option>
                  <option value="away">{awayCode} win</option>
                </select>
                <select name="margin" className={`${ui.select} ${styles.sel}`} defaultValue={p?.margin ?? ""} aria-label={`${pl.username}: margin`}>
                  <option value="">No margin</option>
                  <option value="1">By 1</option>
                  <option value="2">By 2</option>
                  <option value="3">By 3+</option>
                </select>
                <select name="firstGoal" className={`${ui.select} ${styles.sel}`} defaultValue={p?.first_goal ?? ""} aria-label={`${pl.username}: first goal`}>
                  <option value="">No 1st goal</option>
                  <option value="home">1st: {homeCode}</option>
                  <option value="away">1st: {awayCode}</option>
                </select>
                <span className={styles.pts} title="Points for this match">
                  {pts == null ? "" : pts > 0 ? `+${pts}` : pts}
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
  );
}
