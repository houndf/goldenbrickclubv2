"use client";

import { useActionState } from "react";
import ui from "@/components/ui.module.css";
import { resetPasswordAction, type ResetState } from "./actions";
import { CopyButton } from "./CopyButton";

export function ResetPasswordButton({ playerId, username }: { playerId: string; username: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Reset ${username}'s password? Their current password will stop working.`)) {
          e.preventDefault();
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8, flexBasis: "100%" }}
    >
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="username" value={username} />
      {state.password ? (
        <div className={ui.notice} role="status" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span>
            Temporary password for {state.username}: <span className={ui.code}>{state.password}</span>
          </span>
          <span style={{ fontSize: 13 }}>Shown once. Send it to them privately; they can change it in their profile.</span>
          <CopyButton text={state.password} label="COPY PASSWORD" />
        </div>
      ) : (
        <button type="submit" className={`${ui.button} ${ui.secondary} ${ui.small}`} disabled={pending} style={{ alignSelf: "flex-start" }}>
          {pending ? "RESETTING…" : "RESET PASSWORD"}
        </button>
      )}
      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
