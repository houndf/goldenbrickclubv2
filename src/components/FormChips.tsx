import type { FormResult } from "@/lib/archive";
import styles from "./FormChips.module.css";

const labels: Record<FormResult, string> = { W: "win", D: "draw", L: "loss" };

/** Recent results, newest first. */
export function FormChips({ results }: { results: FormResult[] }) {
  return (
    <ol className={styles.chips} aria-label={`Recent form, newest first: ${results.map((r) => labels[r]).join(", ")}`}>
      {results.map((r, i) => (
        <li key={i} className={`${styles.chip} ${styles[r]}`} aria-hidden="true">
          {r}
        </li>
      ))}
    </ol>
  );
}
