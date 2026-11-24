import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { requireAdmin } from "@/lib/player";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import ui from "@/components/ui.module.css";
import styles from "./data.module.css";

export const instant = false;
export const metadata = { title: "Admin · Data · Golden Brick Club" };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

type TeamRef = { code: string } | null;

/** Admin data editor: pick a season's match or a Cup matchup to fix its result or anyone's prediction. */
export default async function AdminDataPage({ searchParams }: PageProps<"/admin/data">) {
  await requireAdmin();
  const params = await searchParams;
  const db = createSupabaseAdminClient();

  const [{ data: seasons }, { data: tournaments }, { data: players }] = await Promise.all([
    db.from("seasons").select("id, scoring").order("id", { ascending: false }),
    db.from("tournaments").select("id, name, status").order("created_at", { ascending: false }),
    db.from("profiles").select("id, username, initials, avatar_color").order("username"),
  ]);
  const seasonList = seasons ?? [];
  const tList = tournaments ?? [];

  // Default: the Cup while one is live, else the season of the most recent finished match.
  let view = typeof params.view === "string" ? params.view : "";
  if (!view && tList.some((x) => x.status === "live")) view = "cup";
  if (!view) {
    const { data: last } = await db
      .from("matches")
      .select("season_id")
      .eq("status", "final")
      .order("kickoff_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    view = String(last?.season_id ?? seasonList[0]?.id ?? "cup");
  }

  return (
    <main className={`${ui.screen} ${ui.wide}`}>
      <div className={ui.topBar}>
        <BackButton href="/admin" label="Back to admin" />
        <h1 className={ui.screenTitle}>DATA</h1>
      </div>
      <p className={ui.lead} style={{ fontSize: "0.875rem" }}>
        Fix a result or anyone&apos;s prediction. Your edits ignore pick locks, and a result you save here won&apos;t be
        overwritten by the automatic results feed.
      </p>

      <section className={`${ui.panel} ${ui.span}`} aria-labelledby="for-player">
        <h2 id="for-player" className={ui.sectionTitle}>
          Enter a pick for someone
        </h2>
        <p className={ui.muted} style={{ fontSize: "0.8125rem", margin: 0 }}>
          Tap the player, then tap their team on each matchup.
        </p>
        <div className={styles.playerChips}>
          {(players ?? []).map((p) => (
            <Link key={p.id} href={`/admin/data/player/${p.id}`} className={styles.playerChip}>
              <span className={styles.chipDot} style={{ background: p.avatar_color }} aria-hidden="true">
                {p.initials}
              </span>
              {p.username}
            </Link>
          ))}
        </div>
      </section>

      <h2 className={`${ui.sectionTitle} ${ui.span}`} style={{ marginTop: "0.5rem" }}>
        Fix a result or look at one game
      </h2>
      <nav className={`${styles.tabs} ${ui.span}`} aria-label="What to edit">
        {seasonList.map((s) => (
          <Link
            key={s.id}
            href={`/admin/data?view=${s.id}`}
            className={`${ui.button} ${ui.small} ${view === String(s.id) ? ui.primary : ui.secondary}`}
            aria-current={view === String(s.id) ? "page" : undefined}
          >
            {s.id} SEASON
          </Link>
        ))}
        {tList.length > 0 && (
          <Link
            href="/admin/data?view=cup"
            className={`${ui.button} ${ui.small} ${view === "cup" ? ui.primary : ui.secondary}`}
            aria-current={view === "cup" ? "page" : undefined}
          >
            CUPS
          </Link>
        )}
      </nav>

      {view === "cup" ? (
        <CupList tournaments={tList} selected={typeof params.t === "string" ? Number(params.t) : null} />
      ) : (
        <SeasonList season={Number(view)} legacy={seasonList.find((s) => String(s.id) === view)?.scoring === "legacy_exact"} />
      )}
    </main>
  );
}

async function SeasonList({ season, legacy }: { season: number; legacy: boolean }) {
  const db = createSupabaseAdminClient();
  const { data: matches } = await db
    .from("matches")
    .select("id, kickoff_at, status, home_goals, away_goals, home:teams!matches_home_team_id_fkey(code), away:teams!matches_away_team_id_fkey(code)")
    .eq("season_id", season)
    .order("kickoff_at");
  const ids = (matches ?? []).map((m) => m.id);
  const { data: pickRows } = ids.length
    ? await db.from(legacy ? "legacy_picks" : "picks").select("match_id").in("match_id", ids)
    : { data: [] };
  const count = new Map<string, number>();
  for (const p of pickRows ?? []) count.set(p.match_id, (count.get(p.match_id) ?? 0) + 1);

  if (!matches?.length) {
    return (
      <section className={ui.panel}>
        <p className={ui.lead}>No matches in {season} yet.</p>
      </section>
    );
  }
  return (
    <section className={`${ui.panel} ${ui.span}`} aria-label={`${season} matches`}>
      <h2 className={ui.sectionTitle}>
        {season} matches {legacy ? "· exact-score picks" : ""}
      </h2>
      <ul className={ui.list}>
        {matches.map((m) => {
          const home = (m.home as unknown as TeamRef)?.code ?? "?";
          const away = (m.away as unknown as TeamRef)?.code ?? "?";
          const final = m.status === "final";
          return (
            <li key={m.id}>
              <Link href={`/admin/data/match/${encodeURIComponent(m.id)}`} className={styles.item}>
                <span className={styles.date}>
                  {day(m.kickoff_at)}
                  <br />
                  {time(m.kickoff_at)}
                </span>
                <span className={styles.teams}>
                  {home} v {away}
                </span>
                <span className={styles.meta}>
                  <span className={styles.score}>{final ? `${m.home_goals}–${m.away_goals}` : m.status.toUpperCase()}</span>
                  {count.get(m.id) ?? 0} picks ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function CupList({ tournaments, selected }: { tournaments: { id: number; name: string; status: string }[]; selected: number | null }) {
  const db = createSupabaseAdminClient();
  const t = tournaments.find((x) => x.id === selected) ?? tournaments.find((x) => x.status === "live") ?? tournaments[0];
  if (!t) return null;
  const { data: rounds } = await db.from("tournament_rounds").select("id, number, name").eq("tournament_id", t.id).order("number");
  const roundIds = (rounds ?? []).map((r) => r.id);
  const { data: ties } = roundIds.length
    ? await db
        .from("tournament_ties")
        .select("id, round_id, slot, label, winner, first_kickoff, team_a:teams!tournament_ties_team_a_id_fkey(code), team_b:teams!tournament_ties_team_b_id_fkey(code)")
        .in("round_id", roundIds)
        .order("slot")
    : { data: [] };
  const tieIds = (ties ?? []).map((x) => x.id);
  const { data: pickRows } = tieIds.length ? await db.from("tournament_picks").select("tie_id").in("tie_id", tieIds) : { data: [] };
  const count = new Map<number, number>();
  for (const p of pickRows ?? []) count.set(p.tie_id, (count.get(p.tie_id) ?? 0) + 1);

  return (
    <>
      {tournaments.length > 1 && (
        <nav className={`${styles.tabs} ${ui.span}`} aria-label="Tournament">
          {tournaments.map((x) => (
            <Link
              key={x.id}
              href={`/admin/data?view=cup&t=${x.id}`}
              className={`${ui.button} ${ui.small} ${x.id === t.id ? ui.primary : ui.secondary}`}
            >
              {x.name}
            </Link>
          ))}
        </nav>
      )}
      {(rounds ?? []).map((r) => {
        const list = (ties ?? []).filter((x) => x.round_id === r.id);
        return (
          <section key={r.id} className={ui.panel} aria-label={r.name}>
            <h2 className={ui.sectionTitle}>
              {r.number}. {r.name}
            </h2>
            {list.length === 0 ? (
              <p className={ui.muted} style={{ fontSize: "0.875rem" }}>
                No matchups yet.
              </p>
            ) : (
              <ul className={ui.list}>
                {list.map((x) => {
                  const a = (x.team_a as unknown as TeamRef)?.code ?? "?";
                  const b = (x.team_b as unknown as TeamRef)?.code ?? "?";
                  return (
                    <li key={x.id}>
                      <Link href={`/admin/data/tie/${x.id}`} className={styles.item}>
                        <span className={styles.date}>{x.first_kickoff ? day(x.first_kickoff) : "TBD"}</span>
                        <span className={styles.teams}>
                          {x.label ? `${x.label} · ` : ""}
                          {a} v {b}
                        </span>
                        <span className={styles.meta}>
                          <span className={styles.score}>{x.winner ? `${x.winner === "home" ? a : b} ›` : "OPEN"}</span>
                          {count.get(x.id) ?? 0} picks ›
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
