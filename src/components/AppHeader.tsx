import Link from "next/link";
import type { Player } from "@/lib/player";
import { Avatar } from "./Avatar";
import { BrickLogo } from "./BrickLogo";
import { BrickToggle } from "./BrickToggle";
import styles from "./AppHeader.module.css";

export function AppHeader({ player, goldOnly, oracle = 0 }: { player: Player; goldOnly: boolean; oracle?: number }) {
  return (
    <header className={styles.header}>
      {player.extraGold ? (
        <BrickToggle goldOnly={goldOnly} />
      ) : (
        <span className={styles.brickStatic}>
          <BrickLogo size={40} />
        </span>
      )}
      <Link href="/profile" aria-label="Your profile" className={styles.avatarLink}>
        <Avatar initials={player.initials} color={player.avatarColor} oracle={oracle} />
      </Link>
    </header>
  );
}
