import { HiddenResultsBanner, HiddenResultsCard } from "@/components/HiddenResults";
import { StandingsList } from "@/components/StandingsList";
import { getLegacySeason } from "@/lib/archiveData";
import { requirePlayer } from "@/lib/player";
import { getLeagueSettings } from "@/lib/settings";
import { getOracleWins } from "@/lib/tournamentData";
import { isGoldView } from "@/lib/view";
import ui from "@/components/ui.module.css";

export const instant = false;
export const metadata = { title: "Table · Golden Brick Club" };

export default async function TablePage() {
  const player = await requirePlayer();
  const goldOnly = await isGoldView(player);
  const [season, settings, oracles] = await Promise.all([
    getLegacySeason(2026, { goldOnly }),
    getLeagueSettings(),
    getOracleWins(),
  ]);
  const isAdmin = player.role === "admin";

  if (settings.resultsHidden && !isAdmin) {
    return (
      <main className={ui.screen}>
        <h1 className={ui.screenTitle}>TABLE</h1>
        <HiddenResultsCard />
      </main>
    );
  }

  if (!season) {
    return (
      <main className={ui.screen}>
        <h1 className={ui.screenTitle}>TABLE</h1>
        <p className={ui.lead}>No results yet.</p>
      </main>
    );
  }

  const nameOf = (profileId: string | null, fallback: string) =>
    (profileId && season.looks[profileId]?.username) || fallback;

  return (
    <main className={ui.screen}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.75rem" }}>
        <h1 className={ui.screenTitle}>TABLE</h1>
        <span className={ui.stamp} style={{ fontSize: "0.9375rem", background: goldOnly ? "var(--gold)" : undefined }}>
          {goldOnly ? "2026 · GOLD ONLY" : "2026 · FINAL"}
        </span>
      </div>

      {settings.resultsHidden && <HiddenResultsBanner />}

      <section className={ui.panel} aria-labelledby="season-heading">
        <h2 id="season-heading" className={ui.sectionTitle}>
          Season standings
        </h2>
        <p className={ui.lead} style={{ fontSize: "0.8125rem" }}>
          {season.matchCount} matches · old exact-score rules · ties broken by lowest accuracy offset
        </p>
        <StandingsList rows={season.standings} looks={season.looks} meId={player.id} showOffset oracles={oracles} />
      </section>

      <details className={`${ui.panel} ${ui.collapsible}`}>
        <summary className={ui.collapsibleSummary}>
          <span className={ui.sectionTitle}>Segment trophies</span>
          <span className={ui.muted} style={{ fontSize: "0.8125rem" }}>{season.segments.length} segments</span>
          <svg className={ui.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </summary>
        <ul className={ui.list}>
          {season.segments.map((s) => (
            <li key={s.number} className={ui.row}>
              <div className={ui.rowMain}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem" }}>
                  SEGMENT {s.number} <span className={ui.muted} style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem" }}>· {s.matches} matches</span>
                </span>
                {s.winner && (
                  <span>
                    <span className={ui.tag}>GNOMORE LOSSUS</span> {nameOf(s.winner.profileId, s.winner.name)} ({s.winner.points})
                  </span>
                )}
                {player.extraGold && s.spoon && (
                  <span>
                    <span className={ui.tag} style={{ background: "var(--red)", color: "var(--cream)" }}>
                      WOODEN SPOON
                    </span>{" "}
                    {nameOf(s.spoon.profileId, s.spoon.name)} ({s.spoon.points})
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!player.extraGold && <p className={ui.lead} style={{ fontSize: "0.8125rem" }}>Wooden Spoon results are for Extra Gold members.</p>}
      </details>
    </main>
  );
}
