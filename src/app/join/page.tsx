import { BackButton } from "@/components/BackButton";
import { SetupNotice } from "@/components/SetupNotice";
import { normalizeInviteCode } from "@/lib/accounts";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import ui from "@/components/ui.module.css";
import { JoinForm } from "./JoinForm";

// Reads the session/request on every visit, so it renders on the server per request.
export const instant = false;

export const metadata = { title: "Join · Golden Brick Club" };

export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { code } = await searchParams;
  const initialCode = typeof code === "string" ? normalizeInviteCode(code) : "";

  return (
    <main className={ui.screen}>
      <div className={ui.topBar}>
        <BackButton />
      </div>
      <div>
        <h1 className={ui.bigTitle}>
          JOIN THE
          <br />
          CLUB!
        </h1>
        <p className={ui.lead} style={{ marginTop: "0.875rem" }}>
          Golden Brick Club is invite-only. Enter the code you were sent.
        </p>
      </div>
      {isSupabaseConfigured() ? <JoinForm initialCode={initialCode} /> : <SetupNotice />}
    </main>
  );
}
