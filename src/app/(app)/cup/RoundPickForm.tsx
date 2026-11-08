"use client";

import { useActionState, useState } from "react";
import type { Side, TTie } from "@/lib/tournament";
import ui from "@/components/ui.module.css";
import styles from "./cup.module.css";
import { saveRoundPicksAction, type PickState } from "./actions";

export function RoundPickForm({
  roundId,
  points,
  isFinal,
  ties,
  initialPicks,
  initialGoals,
}: {
  roundId: number;
  points: number;
  isFinal: boolean;
  ties: TTie[];
  initialPicks: Record<number, Side>;
  initialGoals: number | null;
}) {
  const [picks, setPicks] = useState<Record<number, Side>>(initialPicks);
  const [goals, setGoals] = useState<number>(initialGoals ?? 2);
  const [state, formAction, pending] = useActionState<PickState, FormData>(saveRoundPicksAction, {});
  const done = Object.keys(picks).length;

  return (
    <form action={formAction} className={ui.form}>
      <input type="hidden" name="roundId" value={roundId} />
      {isFinal && <input type="hidden" name="totalGoals" value={goals} />}

      {ties.map((tie) => (
        <fieldset key={tie.id} className={styles.tie}>
          <legend className={styles.tieLabel}>{tie.label ?? "Who goes through?"}</legend>
          <div className={styles.tieRow}>
            {(["home", "away"] as const).map((side) => {
              const team = side === "home" ? tie.teamA : tie.teamB;
              const seed = side === "home" ? tie.seedA : tie.seedB;
              const on = picks[tie.id] === side;
              return (
                <label key={side} className={on ? `${styles.teamButton} ${styles.teamOn}` : styles.teamButton}>
                  <input
                    type="radio"
                    name={`tie_${tie.id}`}
                    value={side}
                    checked={on}
                    onChange={() => setPicks((p) => ({ ...p, [tie.id]: side }))}
                    className={styles.radio}
                  />
                  {seed != null && <span className={styles.seed}>{seed}</span>}
                  <span className={styles.teamCode}>{team.code}</span>
                  <span className={styles.teamName}>{team.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {isFinal && (
        <div className={ui.panel} style={{ gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span className={ui.sectionTitle}>Tie-breaker</span>
            <span className={ui.muted} style={{ fontSize: 12, fontWeight: 900 }}>NO POINTS</span>
          </div>
          <p className={ui.lead} style={{ fontSize: 14 }}>
            Total goals in the final, including extra time (shootout goals don&apos;t count). Closest guess wins a tie.
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
            <button type="button" className={styles.stepper} aria-label="Fewer goals" onClick={() => setGoals((g) => Math.max(0, g - 1))}>
              –
            </button>
            <output className={styles.goals} aria-live="polite">
              {goals}
            </output>
            <button type="button" className={styles.stepper} aria-label="More goals" onClick={() => setGoals((g) => Math.min(30, g + 1))}>
              +
            </button>
          </div>
        </div>
      )}

      <p className={styles.footerNote}>
        {done} of {ties.length} picked · +{points} each · a miss scores 0
      </p>
      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}
      {state.savedAt && !pending && (
        <p className={ui.notice} role="status">
          Picks locked in! You can change them until the round locks.
        </p>
      )}
      <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending || done === 0}>
        {pending ? "SAVING…" : isFinal ? "LOCK IN MY CHAMPION" : "LOCK IN MY PICKS"}
      </button>
    </form>
  );
}
