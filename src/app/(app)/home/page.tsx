import Link from "next/link";
import { ClubRecordCard } from "@/components/ClubRecordCard";
import { HiddenResultsBanner, HiddenResultsCard } from "@/components/HiddenResults";
import { getLegacySeason } from "@/lib/archiveData";
import { requirePlayer } from "@/lib/player";
import { getLeagueSettings } from "@/lib/settings";
import { isGoldView } from "@/lib/view";
import ui from "@/components/ui.module.css";

export const instant = false;
export const metadata = { title: "Home · Golden Brick Club" };

/** Offseason Home: last season's wrap-up until the 2027 schedule and picks are live. */
export default async function HomePage() {
  const player = await requirePlayer();
  const goldOnly = await isGoldView(player);
  const [season, settings] = await Promise.all([getLegacySeason(2026, { goldOnly }), getLeagueSettings()]);
  const isAdmin = player.role === "admin";
  const hideResults = settings.resultsHidden && !isAdmin;

  const champ = season?.standings[0];
  const mine = season?.standings.find((r) => r.profileId === player.id);
  const myTrophies = season?.segments.filter((s) => s.winner?.profileId === player.id).length ?? 0;
  const champLook = champ?.profileId ? season?.looks[champ.profileId] : undefined;
  // Last place takes the Wooden Spoon (shown to Extra Gold members, like on the Table).
  const spoon = player.extraGold && season && season.standings.length > 1 ? season.standings[season.standings.length - 1] : undefined;
  const spoonLook = spoon?.profileId ? season?.looks[spoon.profileId] : undefined;

  return (
    <main className={ui.screen}>
      <div>
        <h1 className={ui.bigTitle} style={{ fontSize: "2.5rem", overflowWrap: "anywhere" }}>
          HEY, {player.username.toUpperCase()}!
        </h1>
        <p className={ui.lead} style={{ marginTop: "0.75rem" }}>
          It&apos;s the offseason. Picks open when the 2027 schedule drops.
        </p>
      </div>

      {settings.resultsHidden && isAdmin && <HiddenResultsBanner />}
      {hideResults && <HiddenResultsCard />}

      {champ && !hideResults && (
        <Link
          href="/table"
          className={ui.panel}
          style={{ background: "var(--gold)", color: "var(--ink)", textDecoration: "none", transform: "rotate(-1deg)", flexDirection: "row", alignItems: "center" }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="#FFF4DC" stroke="#0B0810" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
          </svg>
          <span style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 900, letterSpacing: 1 }}>{goldOnly ? "2026 GNOMORE LOSSUS · GOLD" : "2026 GNOMORE LOSSUS"}</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "1.625rem", lineHeight: 1.05, overflowWrap: "anywhere" }}>
              {champLook?.username ?? champ.name}
            </span>
            <span style={{ fontSize: "0.8125rem" }}>{champ.points} pts · see the final table ›</span>
          </span>
        </Link>
      )}

      {spoon && !hideResults && (
        <Link href="/table" className={`${ui.panel} ${ui.woodCard}`}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="#E9C38F" stroke="#2A160A" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <ellipse cx="9" cy="8" rx="4.6" ry="6" transform="rotate(-35 9 8)" />
            <path d="M11.6 11.8l8.6 8.4a1.4 1.4 0 0 1-2 2l-8.4-8.6" />
          </svg>
          <span style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 900, letterSpacing: 1 }}>{goldOnly ? "2026 WOODEN SPOON · GOLD" : "2026 WOODEN SPOON"}</span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "1.625rem", lineHeight: 1.05, overflowWrap: "anywhere" }}>
              {spoonLook?.username ?? spoon.name}
            </span>
            <span style={{ fontSize: "0.8125rem" }}>{spoon.points} pts · &apos;Bout to get cooking! ›</span>
          </span>
        </Link>
      )}

      {mine && !hideResults && (
        <section className={ui.panel} aria-label="Your 2026 season">
          <span className={ui.label}>{goldOnly ? "Your 2026 among gold members" : "Your 2026"}</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.875rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "2.75rem", lineHeight: 1 }}>#{mine.rank}</span>
            <span className={ui.muted}>
              {mine.points} pts · {mine.picks} picks · {myTrophies} segment {myTrophies === 1 ? "win" : "wins"}
            </span>
          </div>
        </section>
      )}

      {season?.club && <ClubRecordCard record={season.club} label="ATLANTA UNITED · 2026" />}

      <div className={ui.spacer} />
    </main>
  );
}
