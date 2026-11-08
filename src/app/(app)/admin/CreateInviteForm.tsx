"use client";

import { useActionState } from "react";
import ui from "@/components/ui.module.css";
import { createInviteAction, type InviteState } from "./actions";
import { CopyButton } from "./CopyButton";

export function CreateInviteForm({
  legacyOptions,
  origin,
}: {
  legacyOptions: { id: number; name: string }[];
  origin: string;
}) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(createInviteAction, {});

  return (
    <form action={formAction} className={ui.form} key={state.code ?? "new"}>
      <div className={ui.field}>
        <label htmlFor="note" className={ui.label}>
          Who is it for?
        </label>
        <input id="note" name="note" className={ui.input} placeholder="e.g. Zee" maxLength={60} />
      </div>
      {legacyOptions.length > 0 && (
        <div className={ui.field}>
          <label htmlFor="legacyPlayerId" className={ui.label}>
            Link to a 2026 player (optional)
          </label>
          <select id="legacyPlayerId" name="legacyPlayerId" className={ui.select} defaultValue="">
            <option value="">No 2026 history</option>
            {legacyOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className={ui.check}>
        <input type="checkbox" name="grantsExtraGold" /> Extra Gold member
      </label>
      <label className={ui.check}>
        <input type="checkbox" name="grantsAdmin" /> Commissioner (admin)
      </label>

      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}
      {state.code && (
        <div className={ui.notice} role="status" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <span>
            Invite for {state.note ?? "your friend"}: <span className={ui.code}>{state.code}</span>
          </span>
          <CopyButton text={`${origin}/join?code=${state.code}`} />
        </div>
      )}

      <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending} style={{ fontSize: "1.375rem" }}>
        {pending ? "MAKING…" : "MAKE INVITE CODE"}
      </button>
    </form>
  );
}
