import { headers } from "next/headers";
import { BackButton } from "@/components/BackButton";
import { requireAdmin } from "@/lib/player";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ui from "@/components/ui.module.css";
import { revokeInviteAction, setExtraGoldAction, setRoleAction } from "./actions";
import { CopyButton } from "./CopyButton";
import { CreateInviteForm } from "./CreateInviteForm";
import { ResetPasswordButton } from "./ResetPasswordButton";

// Reads the session/request on every visit, so it renders on the server per request.
export const instant = false;

export const metadata = { title: "Admin · Golden Brick Club" };

interface InviteRow {
  code: string;
  note: string | null;
  legacy_player_id: number | null;
  grants_admin: boolean;
  grants_extra_gold: boolean;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
  revoked_at: string | null;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export default async function AdminPage() {
  const me = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: profiles }, { data: invites }, { data: legacy }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, initials, avatar_color, role, extra_gold, created_at")
      .order("username"),
    supabase.from("invite_codes").select("*").order("created_at", { ascending: false }),
    supabase.from("legacy_players").select("id, name, profile_id").order("name"),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const allInvites = (invites ?? []) as InviteRow[];
  const openInvites = allInvites.filter((i) => !i.used_at && !i.revoked_at);
  const legacyById = new Map((legacy ?? []).map((l) => [l.id, l]));
  const legacyByProfile = new Map((legacy ?? []).filter((l) => l.profile_id).map((l) => [l.profile_id, l.name]));
  const legacyWithInvite = new Set(allInvites.map((i) => i.legacy_player_id).filter(Boolean));
  const legacyOptions = (legacy ?? [])
    .filter((l) => !l.profile_id && !legacyWithInvite.has(l.id))
    .map((l) => ({ id: l.id, name: l.name }));

  return (
    <main className={`${ui.screen} ${ui.wide}`}>
      <div className={ui.topBar}>
        <BackButton href="/home" label="Back to home" />
        <h1 className={ui.screenTitle}>ADMIN PORTAL</h1>
      </div>

      <section className={ui.panel} aria-labelledby="new-invite">
        <h2 id="new-invite" className={ui.sectionTitle}>
          New invite
        </h2>
        <p className={ui.lead}>Each code works once. Link it to a 2026 player to bring their history along.</p>
        <CreateInviteForm legacyOptions={legacyOptions} origin={origin} />
      </section>

      <section className={ui.panel} aria-labelledby="open-invites">
        <h2 id="open-invites" className={ui.sectionTitle}>
          Unused invites ({openInvites.length})
        </h2>
        {openInvites.length === 0 ? (
          <p className={ui.lead}>None right now.</p>
        ) : (
          <ul className={ui.list}>
            {openInvites.map((invite) => {
              const legacyName = invite.legacy_player_id ? legacyById.get(invite.legacy_player_id)?.name : null;
              return (
                <li key={invite.code} className={ui.row}>
                  <div className={ui.rowMain}>
                    <span className={ui.code}>{invite.code}</span>
                    <span className={ui.muted} style={{ fontSize: 13 }}>
                      {invite.note ?? legacyName ?? "No note"}
                      {legacyName ? " · 2026 history" : ""} · made {shortDate(invite.created_at)}
                    </span>
                    <span>
                      {invite.grants_admin && <span className={ui.tag}>ADMIN</span>}
                      {invite.grants_extra_gold && <span className={ui.tag}>EXTRA GOLD</span>}
                    </span>
                  </div>
                  <div className={ui.rowActions}>
                    <CopyButton text={`${origin}/join?code=${invite.code}`} />
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="code" value={invite.code} />
                      <button type="submit" className={`${ui.button} ${ui.danger} ${ui.small}`}>
                        REVOKE
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={ui.panel} aria-labelledby="players">
        <h2 id="players" className={ui.sectionTitle}>
          Players ({profiles?.length ?? 0})
        </h2>
        <ul className={ui.list}>
          {(profiles ?? []).map((p) => {
            const isMe = p.id === me.id;
            const legacyName = legacyByProfile.get(p.id);
            return (
              <li key={p.id} className={ui.row}>
                <div className={ui.avatar} style={{ background: p.avatar_color }} aria-hidden="true">
                  {p.initials}
                </div>
                <div className={ui.rowMain}>
                  <span style={{ fontWeight: 900 }}>
                    {p.username}
                    {isMe ? " (you)" : ""}
                  </span>
                  <span className={ui.muted} style={{ fontSize: 13 }}>
                    Joined {shortDate(p.created_at)}
                    {legacyName ? ` · 2026 as ${legacyName}` : ""}
                  </span>
                  <span>
                    {p.role === "admin" && <span className={ui.tag}>ADMIN</span>}
                    {p.extra_gold && <span className={ui.tag}>EXTRA GOLD</span>}
                  </span>
                </div>
                <div className={ui.rowActions}>
                  <form action={setExtraGoldAction}>
                    <input type="hidden" name="playerId" value={p.id} />
                    <input type="hidden" name="extraGold" value={String(!p.extra_gold)} />
                    <button type="submit" className={`${ui.button} ${ui.secondary} ${ui.small}`}>
                      {p.extra_gold ? "REMOVE GOLD" : "GIVE GOLD"}
                    </button>
                  </form>
                  {!isMe && (
                    <form action={setRoleAction}>
                      <input type="hidden" name="playerId" value={p.id} />
                      <input type="hidden" name="role" value={p.role === "admin" ? "player" : "admin"} />
                      <button type="submit" className={`${ui.button} ${ui.secondary} ${ui.small}`}>
                        {p.role === "admin" ? "REMOVE ADMIN" : "MAKE ADMIN"}
                      </button>
                    </form>
                  )}
                </div>
                <ResetPasswordButton playerId={p.id} username={p.username} />
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
