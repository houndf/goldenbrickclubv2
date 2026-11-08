import Link from "next/link";
import styles from "../page.module.css";

export const metadata = { title: "Log in · Golden Brick Club" };

/** Placeholder until the login method is decided and Supabase Auth is wired up. */
export default function LoginPage() {
  return (
    <main className={styles.screen}>
      <h1 className={styles.title} style={{ textAlign: "left", color: "var(--accent)" }}>
        WELCOME
        <br />
        BACK!
      </h1>
      <p className={styles.tagline}>Login is being built next.</p>
      <div className={styles.spacer} />
      <Link href="/" className={styles.primaryButton}>
        BACK
      </Link>
    </main>
  );
}
