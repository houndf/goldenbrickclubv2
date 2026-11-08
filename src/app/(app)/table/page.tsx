import { StandingsList } from "@/components/StandingsList";
import { getLegacySeason } from "@/lib/archiveData";
import { requirePlayer } from "@/lib/player";
import ui from "@/components/ui.module.css";

export const instant = false;
export const metadata = { title: "Table · Golden Brick Club" };

export default async function TablePage() {
  const [player, season] = await Promise.all([requirePlayer(), getLegacySeason(2026)]);

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 className={ui.screenTitle}>TABLE</h1>
        <span className={ui.stamp} style={{ fontSize: 15 }}>2026 · FINAL</span>
      </div>

      <section className={ui.panel} aria-labelledby="season-heading">
        <h2 id="season-heading" className={ui.sectionTitle}>
          Season standings
        </h2>
        <p className={ui.lead} style={{ fontSize: 13 }}>
          {season.matchCount} matches · old exact-score rules · ties broken by lowest accuracy offset
        </p>
        <StandingsList rows={season.standings} looks={season.looks} meId={player.id} showOffset />
      </section>

      <section className={ui.panel} aria-labelledby="segments-heading">
        <h2 id="segments-heading" className={ui.sectionTitle}>
          Segment trophies
        </h2>
        <ul className={ui.list}>
          {season.segments.map((s) => (
            <li key={s.number} className={ui.row}>
              <div className={ui.rowMain}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>
                  SEGMENT {s.number} <span className={ui.muted} style={{ fontFamily: "var(--font-body)", fontSize: 12 }}>· {s.matches} matches</span>
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
        {!player.extraGold && <p className={ui.lead} style={{ fontSize: 13 }}>Wooden Spoon results are for Extra Gold members.</p>}
      </section>
    </main>
  );
}
