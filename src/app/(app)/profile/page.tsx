import { BackButton } from "@/components/BackButton";
import { requirePlayer } from "@/lib/player";
import ui from "@/components/ui.module.css";
import { logoutAction } from "@/app/auth-actions";
import { ChangePasswordForm } from "./ChangePasswordForm";

// Reads the session/request on every visit, so it renders on the server per request.
export const instant = false;

export const metadata = { title: "Your profile · Golden Brick Club" };

/** First slice of the profile screen: password. Avatar and username editing come later. */
export default async function ProfilePage() {
  const player = await requirePlayer();

  return (
    <main className={ui.screen}>
      <div className={ui.topBar}>
        <BackButton href="/home" label="Back to home" />
        <h1 className={ui.screenTitle}>YOUR PROFILE</h1>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div className={ui.avatar} style={{ width: "4.5rem", height: "4.5rem", fontSize: "1.875rem", background: player.avatarColor }} aria-hidden="true">
          {player.initials}
        </div>
        <div>
          <div className={ui.sectionTitle} style={{ overflowWrap: "anywhere" }}>{player.username}</div>
          <div className={ui.muted} style={{ fontSize: "0.8125rem" }}>
            {player.role === "admin" ? "Commissioner" : "Player"}
            {player.extraGold ? " · Extra Gold ✨" : ""}
          </div>
        </div>
      </div>

      <section className={ui.panel} aria-labelledby="password-heading">
        <h2 id="password-heading" className={ui.sectionTitle}>
          Password
        </h2>
        <ChangePasswordForm />
      </section>

      <div className={ui.spacer} />
      <form action={logoutAction}>
        <button type="submit" className={`${ui.button} ${ui.danger}`} style={{ fontSize: "1.25rem" }}>
          LOG OUT
        </button>
      </form>
    </main>
  );
}
