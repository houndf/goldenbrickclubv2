import Link from "next/link";
import { BrickLogo } from "@/components/BrickLogo";
import { requirePlayer } from "@/lib/player";
import ui from "@/components/ui.module.css";
import { logoutAction } from "../auth-actions";

// Reads the session/request on every visit, so it renders on the server per request.
export const instant = false;

export const metadata = { title: "Home · Golden Brick Club" };

/** Temporary signed-in home until the real Home screen (Milestone 2–3) lands. */
export default async function HomePage() {
  const player = await requirePlayer();

  return (
    <main className={ui.screen}>
      <div className={ui.topBar} style={{ justifyContent: "space-between" }}>
        <BrickLogo size={40} />
        <Link
          href="/profile"
          className={ui.avatar}
          style={{ background: player.avatarColor, textDecoration: "none", boxShadow: "var(--drop-sm)" }}
          aria-label="Your profile"
        >
          {player.initials}
        </Link>
      </div>

      <div>
        <h1 className={ui.bigTitle}>
          YOU&apos;RE IN,
          <br />
          {player.username.toUpperCase()}!
        </h1>
        <p className={ui.lead} style={{ marginTop: 14 }}>
          Picks, the table and the schedule are coming next.
        </p>
      </div>

      {player.role === "admin" && (
        <Link href="/admin" className={`${ui.button} ${ui.primary}`}>
          ADMIN PORTAL
        </Link>
      )}
      <Link href="/profile" className={`${ui.button} ${ui.secondary}`}>
        YOUR PROFILE
      </Link>

      <div className={ui.spacer} />
      <form action={logoutAction}>
        <button type="submit" className={`${ui.button} ${ui.danger}`} style={{ fontSize: 20 }}>
          LOG OUT
        </button>
      </form>
    </main>
  );
}
