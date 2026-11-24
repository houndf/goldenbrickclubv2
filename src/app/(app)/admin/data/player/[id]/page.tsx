import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { requireAdmin } from "@/lib/player";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatEastern } from "@/lib/time";
import ui from "@/components/ui.module.css";
import styles from "../../data.module.css";
import { saveTiePickAdminAction } from "../../actions";

export const instant = false;
export const metadata = { title: "Admin · Picks for a player · Golden Brick Club" };

type TeamRef = { code: string; name: string } | null;

/**
 * Enter or change picks on someone's behalf (e.g. they texted you their pick).
 * One row per Cup matchup: tap a team to save it. Admin entries ignore locks.
 */
export default async function AdminPlayerPicksPage({ params, searchParams }: PageProps<"/admin/data/player/[id]">) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const saved = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const db = createSupabaseAdminClient();

  const { data: player } = await db.from("profiles").select("id, username, initials, avatar_color").eq("id", id).maybeSingle();
  if (!player) notFound();

  // The live Cup (else the most recent one).
  const { data: tournaments } = await db.from("tournaments").select("id, name, status").order("created_at", { ascending: false });
  const t = (tournaments ?? []).find((x) => x.status === "live") ?? tournaments?.[0] ?? null;

  const { data: rounds } = t
    ? await db.from("tournament_rounds").select("id, number, name, points, is_final, locks_at").eq("tournament_id", t.id).order("number")
    : { data: [] };
  const roundIds = (rounds ?? []).map((r) => r.id);
  const { data: ties } = roundIds.length
    ? await db
        .from("tournament_ties")
        .select(
          "id, round_id, slot, label, winner, first_kickoff, team_a:teams!tournament_ties_team_a_id_fkey(code, name), team_b:teams!tournament_ties_team_b_id_fkey(code, name)",
        )
        .in("round_id", roundIds)
        .order("slot")
    : { data: [] };
  const tieIds = (ties ?? []).map((x) => x.id);
  const { data: picks } = tieIds.length
    ? await db.from("tournament_picks").select("tie_id, pick, total_goals").eq("player_id", player.id).in("tie_id", tieIds)
    : { data: [] };
  const mine = new Map((picks ?? []).map((p) => [p.tie_id, p]));
  const back = `/admin/data/player/${player.id}`;
  const now = new Date().getTime();

  return (
    <main className={`${ui.screen} ${ui.wide}`}>
      <div className={ui.topBar}>
        <BackButton href="/admin/data" label="Back to data" />
        <h1 className={ui.screenTitle}>{player.username.toUpperCase()}</h1>
      </div>
      <p className={ui.lead} style={{ fontSize: "0.875rem" }}>
        Picks for {player.username}
        {t ? ` · ${t.name}` : ""}. Tap a team to save it for them. This works even after a matchup has locked.
      </p>
      {error && (
        <p role="alert" className={`${styles.flashError} ${ui.span}`}>
          {error}
        </p>
      )}

      {!t && (
        <section className={ui.panel}>
          <p className={ui.lead}>No Cup to pick in right now.</p>
        </section>
      )}

      {(rounds ?? []).map((r) => {
        const list = (ties ?? []).filter((x) => x.round_id === r.id);
        if (list.length === 0) return null;
        return (
          <section key={r.id} className={ui.panel} aria-label={r.name}>
            <h2 className={ui.sectionTitle}>
              {r.name} <span className={ui.muted} style={{ fontSize: "0.875rem" }}>· {r.points} pts</span>
            </h2>
            <ul className={ui.list}>
              {list.map((x) => {
                const a = x.team_a as unknown as TeamRef;
                const b = x.team_b as unknown as TeamRef;
                const p = mine.get(x.id);
                const base = x.first_kickoff ?? r.locks_at;
                const lockMs = base ? Date.parse(base) - 60 * 60_000 : null;
                const winner = x.winner === "home" ? a : x.winner === "away" ? b : null;
                const justSaved = saved === `t${x.id}`;
                const status = winner
                  ? `${winner.code} went through${p ? (p.pick === x.winner ? ` · +${r.points}` : " · 0 pts") : ""}`
                  : lockMs && lockMs <= now
                    ? "Locked for players"
                    : lockMs
                      ? `Locks ${formatEastern(new Date(lockMs).toISOString())} ET`
                      : "Kickoff not set";
                return (
                  <li key={x.id}>
                    <form
                      id={`row-t${x.id}`}
                      action={saveTiePickAdminAction}
                      className={`${styles.pickRow} ${justSaved ? styles.pickRowSaved : ""}`}
                    >
                      <input type="hidden" name="tieId" value={x.id} />
                      <input type="hidden" name="playerId" value={player.id} />
                      <input type="hidden" name="back" value={back} />
                      <span className={styles.pickInfo}>
                        <strong>
                          {x.label ? `${x.label} · ` : ""}
                          {a?.code} v {b?.code}
                        </strong>
                        {justSaved ? "✓ Saved · " : ""}
                        {p ? `Picked ${p.pick === "home" ? a?.code : b?.code}` : "No pick yet"} · {status}
                      </span>
                      {p && (
                        <button type="submit" name="clear" value="1" className={`${ui.button} ${ui.small} ${ui.secondary}`}>
                          CLEAR
                        </button>
                      )}
                      {r.is_final && (
                        <label className={ui.check} style={{ gridColumn: "1 / -1", fontSize: "0.875rem" }}>
                          Total goals guess (tie-breaker)
                          <input
                            name="totalGoals"
                            type="number"
                            min={0}
                            max={30}
                            className={`${ui.input} ${styles.num}`}
                            defaultValue={p?.total_goals ?? ""}
                          />
                        </label>
                      )}
                      <div className={styles.teamButtons} role="group" aria-label={`Who goes through: ${a?.name} or ${b?.name}`}>
                        {(["home", "away"] as const).map((side) => {
                          const team = side === "home" ? a : b;
                          const on = p?.pick === side;
                          return (
                            <button
                              key={side}
                              type="submit"
                              name="pick"
                              value={side}
                              aria-pressed={on}
                              className={`${styles.teamButton} ${on ? styles.teamButtonOn : ""}`}
                            >
                              {team?.code}
                              {on ? " ✓" : ""}
                            </button>
                          );
                        })}
                      </div>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
