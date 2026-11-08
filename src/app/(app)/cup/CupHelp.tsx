"use client";

import { useRef } from "react";
import styles from "./cup.module.css";

/** A "?" button that opens a short explainer of how Cup picks work. */
export function CupHelp({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={styles.helpButton} aria-label="How the Cup works" onClick={() => ref.current?.showModal()}>
        ?
      </button>
      <dialog
        ref={ref}
        className={styles.helpDialog}
        aria-labelledby="cup-help-title"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className={styles.helpInner}>
          <h2 id="cup-help-title" className={styles.helpTitle}>
            How the Cup works
          </h2>
          {children}
          <button type="button" className={styles.helpClose} onClick={() => ref.current?.close()}>
            GOT IT
          </button>
        </div>
      </dialog>
    </>
  );
}
