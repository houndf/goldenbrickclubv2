"use client";

import { useOptimistic, useTransition } from "react";
import { setGoldViewAction } from "@/app/(app)/view-actions";
import { BrickLogo } from "./BrickLogo";
import styles from "./AppHeader.module.css";

/** Gold = Extra Gold members only. Silver = everyone. */
export function BrickToggle({ goldOnly }: { goldOnly: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(goldOnly);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={styles.brickButton}
      aria-pressed={optimistic}
      aria-label={optimistic ? "Showing Extra Gold members only. Show everyone" : "Showing everyone. Show Extra Gold members only"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await setGoldViewAction(!optimistic);
        })
      }
    >
      <span className={optimistic ? styles.brickGold : styles.brickSilver}>
        <BrickLogo size={40} tone={optimistic ? "gold" : "silver"} />
      </span>
      <span className={styles.brickLabel}>{optimistic ? "GOLD ONLY" : "EVERYONE"}</span>
    </button>
  );
}
