import Link from "next/link";
import { BrickLogo } from "@/components/BrickLogo";
import { ClubRecordCard } from "@/components/ClubRecordCard";
import { StandingsList } from "@/components/StandingsList";
import { getLegacySeason } from "@/lib/archiveData";
import { getLeagueSettings } from "@/lib/settings";
import styles from "./page.module.css";

/** Welcome — the public front door, visible before login. */
export default async function WelcomePage() {
  const [season, settings] = await Promise.all([getLegacySeason(2026), getLeagueSettings()]);

  return (
    <main className={styles.screen}>
      <header className={styles.brand}>
        <BrickLogo size={76} tilt={-6} />
        <h1 className={styles.title}>
          GOLDEN BRICK
          <br />
          <span className={styles.titleAccent}>CLUB</span>
        </h1>
        <p className={styles.tagline}>The Atlanta United prediction league</p>
      </header>

      {season?.club && <ClubRecordCard record={season.club} label="ATLANTA UNITED · 2026" />}

      {season && season.standings.length > 0 && !settings.resultsHidden && (
        <section className={styles.panel} aria-labelledby="top3-heading">
          <div className={styles.cardHead}>
            <h2 id="top3-heading" className={styles.panelLabel}>
              2026 TOP 3
            </h2>
            <span className={styles.panelMeta}>FINAL</span>
          </div>
          <StandingsList rows={season.standings.slice(0, 3)} looks={season.looks} />
        </section>
      )}

      <div className={styles.spacer} />

      <footer className={styles.actions}>
        <Link href="/login" className={styles.primaryButton}>
          LOG IN
        </Link>
        <p className={styles.joinLine}>
          Got an invite? <Link href="/join">Join the club</Link>
        </p>
      </footer>
    </main>
  );
}
