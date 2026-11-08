"use client";

import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/accounts";
import ui from "@/components/ui.module.css";
import { changePasswordAction, type PasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});

  return (
    <form action={formAction} className={ui.form} key={state.done ? "done" : "editing"}>
      <div className={ui.field}>
        <label htmlFor="password" className={ui.label}>
          New password (at least {PASSWORD_MIN_LENGTH} characters)
        </label>
        <input id="password" name="password" type="password" className={ui.input} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </div>
      <div className={ui.field}>
        <label htmlFor="confirm" className={ui.label}>
          New password again
        </label>
        <input id="confirm" name="confirm" type="password" className={ui.input} autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} />
      </div>
      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}
      {state.done && (
        <p className={ui.notice} role="status">
          Password changed.
        </p>
      )}
      <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending} style={{ fontSize: "1.375rem" }}>
        {pending ? "SAVING…" : "CHANGE PASSWORD"}
      </button>
    </form>
  );
}
