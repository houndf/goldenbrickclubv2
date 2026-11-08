import type { StandingRow } from "@/lib/archive";
import type { PlayerLook } from "@/lib/archiveData";
import { Avatar } from "./Avatar";
import { initialsFor } from "@/lib/accounts";
import styles from "./StandingsList.module.css";

/** Ranked list of players. Highlights the leader in gold and "you" in teal. */
export function StandingsList({
  rows,
  looks,
  meId,
  showOffset = false,
  oracles = {},
}: {
  rows: StandingRow[];
  looks: Record<string, PlayerLook>;
  meId?: string;
  showOffset?: boolean;
  oracles?: Record<string, string[]>;
}) {
  return (
    <ol className={styles.list}>
      {rows.map((row, i) => {
        const look = row.profileId ? looks[row.profileId] : undefined;
        const me = meId && row.profileId === meId;
        const cls = [styles.row, i === 0 ? styles.first : "", me ? styles.me : ""].join(" ");
        return (
          <li key={row.playerId} className={cls}>
            <span className={styles.rank}>{row.rank}</span>
            <Avatar
              initials={look?.initials ?? initialsFor(row.name)}
              color={look?.color}
              size={30}
              oracle={row.profileId ? (oracles[row.profileId]?.length ?? 0) : 0}
            />
            <span className={styles.name}>
              {look?.username ?? row.name}
              {me ? " (you)" : ""}
              {showOffset && <span className={styles.offset}>offset {row.offset}</span>}
            </span>
            <span className={styles.points}>{row.points} pts</span>
          </li>
        );
      })}
    </ol>
  );
}
