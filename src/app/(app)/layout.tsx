import { BottomNav } from "@/components/BottomNav";
import { requirePlayer } from "@/lib/player";

// Every signed-in screen reads the session, so it renders per request.
export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const player = await requirePlayer();
  return (
    <>
      <div style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>{children}</div>
      <BottomNav isAdmin={player.role === "admin"} />
    </>
  );
}
