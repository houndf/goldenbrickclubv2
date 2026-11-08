import { BackButton } from "@/components/BackButton";
import { SetupNotice } from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import ui from "@/components/ui.module.css";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in · Golden Brick Club" };

export default function LoginPage() {
  return (
    <main className={ui.screen}>
      <div className={ui.topBar}>
        <BackButton />
      </div>
      <div>
        <h1 className={ui.bigTitle}>
          WELCOME
          <br />
          BACK!
        </h1>
        <p className={ui.lead} style={{ marginTop: 14 }}>
          Log in to make your pick before kickoff.
        </p>
      </div>
      {isSupabaseConfigured() ? <LoginForm /> : <SetupNotice />}
    </main>
  );
}
