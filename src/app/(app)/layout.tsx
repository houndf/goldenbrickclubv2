import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { requirePlayer } from "@/lib/player";
import { isGoldView } from "@/lib/view";
import ui from "@/components/ui.module.css";

// Every signed-in screen reads the session, so it renders per request.
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const player = await requirePlayer();
  const goldOnly = await isGoldView(player);
  return (
    <>
      <AppHeader player={player} goldOnly={goldOnly} />
      <div className={ui.appBody} style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
        {children}
      </div>
      <BottomNav isAdmin={player.role === "admin"} />
    </>
  );
}
