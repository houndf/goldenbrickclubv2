import type { ClubRecord } from "@/lib/archive";
import { FormChips } from "./FormChips";
import styles from "./ClubRecordCard.module.css";

export function ClubRecordCard({ record, label }: { record: ClubRecord; label: string }) {
  return (
    <section className={styles.card} aria-labelledby="club-record-heading">
      <div className={styles.head}>
        <h2 id="club-record-heading" className={styles.label}>
          {label}
        </h2>
        <span className={styles.meta}>
          GF {record.goalsFor} · GA {record.goalsAgainst}
        </span>
      </div>
      <dl className={styles.record}>
        {(
          [
            ["Wins", record.wins],
            ["Draws", record.draws],
            ["Losses", record.losses],
          ] as const
        ).map(([name, value]) => (
          <div key={name} className={styles.tile}>
            <dt className={styles.tileLabel}>{name.toUpperCase()}</dt>
            <dd className={styles.tileValue}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.head}>
        <span className={styles.meta}>{record.points} PTS · LAST 5</span>
        <FormChips results={record.lastFive} />
      </div>
    </section>
  );
}
