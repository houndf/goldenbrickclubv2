import Link from "next/link";
import { BrickLogo } from "@/components/BrickLogo";
import { FormChips } from "@/components/FormChips";
import { sampleClubRecord, sampleSeasonTop3 } from "@/lib/sampleData";
import styles from "./page.module.css";

/** Welcome — the public front door, visible before login. */
export default function WelcomePage() {
  const club = sampleClubRecord;
  const top3 = sampleSeasonTop3;

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

      <section className={styles.clubCard} aria-labelledby="club-heading">
        <div className={styles.cardHead}>
          <h2 id="club-heading" className={styles.cardLabel}>
            {club.team.toUpperCase()} · {club.season}
          </h2>
          <span className={styles.cardMeta}>{club.conferenceRank.toUpperCase()}</span>
        </div>
        <dl className={styles.record}>
          {(
            [
              ["Wins", club.wins],
              ["Draws", club.draws],
              ["Losses", club.losses],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className={styles.recordTile}>
              <dt className={styles.recordLabel}>{label.toUpperCase()}</dt>
              <dd className={styles.recordValue}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.cardHead}>
          <span className={styles.cardMeta}>{club.points} PTS · LAST 5</span>
          <FormChips results={club.lastFive} />
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="top3-heading">
        <div className={styles.cardHead}>
          <h2 id="top3-heading" className={styles.panelLabel}>
            SEASON TOP 3
          </h2>
          <span className={styles.panelMeta}>
            {top3.played} OF {top3.total} PLAYED
          </span>
        </div>
        <ol className={styles.leaders}>
          {top3.leaders.map((leader, i) => (
            <li key={leader.name} className={i === 0 ? `${styles.leader} ${styles.leaderFirst}` : styles.leader}>
              <span className={styles.leaderRank}>{i + 1}</span>
              <span className={styles.avatar} style={{ background: leader.color }} aria-hidden="true" />
              <span className={styles.leaderName}>{leader.name}</span>
              <span className={styles.leaderPoints}>{leader.points} pts</span>
            </li>
          ))}
        </ol>
      </section>

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
