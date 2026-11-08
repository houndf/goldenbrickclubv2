import { Avatar } from "@/components/Avatar";
import { getLegacySeason } from "@/lib/archiveData";
import { requirePlayer } from "@/lib/player";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ui from "@/components/ui.module.css";

export const instant = false;
export const metadata = { title: "Friends · Golden Brick Club" };

export default async function FriendsPage() {
  const me = await requirePlayer();
  const supabase = await createSupabaseServerClient();
  const [{ data: profiles }, season] = await Promise.all([
    supabase.from("profiles").select("id, username, initials, avatar_color, role, extra_gold").order("username"),
    getLegacySeason(2026),
  ]);
  const finish = new Map((season?.standings ?? []).filter((r) => r.profileId).map((r) => [r.profileId!, r]));

  return (
    <main className={ui.screen}>
      <h1 className={ui.screenTitle}>THE CLUB</h1>
      <p className={ui.lead}>{profiles?.length ?? 0} members</p>
      <ul className={ui.list}>
        {(profiles ?? []).map((p) => {
          const f = finish.get(p.id);
          return (
            <li key={p.id} className={ui.row} style={p.id === me.id ? { background: "var(--teal)", color: "var(--ink)" } : undefined}>
              <Avatar initials={p.initials} color={p.avatar_color} />
              <div className={ui.rowMain}>
                <span style={{ fontWeight: 900 }}>
                  {p.username}
                  {p.id === me.id ? " (you)" : ""}
                </span>
                <span style={{ fontSize: 13, opacity: 0.8 }}>{f ? `2026: #${f.rank} · ${f.points} pts` : "New for 2027"}</span>
              </div>
              <span>
                {p.role === "admin" && <span className={ui.tag}>COMMISH</span>}
                {p.extra_gold && <span className={ui.tag}>✨</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
