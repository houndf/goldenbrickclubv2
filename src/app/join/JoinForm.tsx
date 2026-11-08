"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { checkInviteAction, joinAction, type FormState, type InviteCheck } from "../auth-actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/accounts";
import ui from "@/components/ui.module.css";

export function JoinForm({ initialCode }: { initialCode: string }) {
  const [invite, checkAction, checking] = useActionState<InviteCheck, FormData>(checkInviteAction, {});

  if (!invite.valid) {
    return (
      <form action={checkAction} className={ui.form}>
        <div className={ui.field}>
          <label htmlFor="code" className={ui.label}>
            Invite code
          </label>
          <input
            id="code"
            name="code"
            className={`${ui.input} ${ui.codeInput}`}
            placeholder="XXXX-XXXX"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
            defaultValue={invite.code ?? initialCode}
          />
        </div>
        {invite.error && (
          <p className={ui.error} role="alert">
            {invite.error}
          </p>
        )}
        <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={checking}>
          {checking ? "CHECKING…" : "CHECK CODE"}
        </button>
        <p className={ui.lead} style={{ textAlign: "center" }}>
          No code? Ask the commissioner for one. Already joined? <Link href="/login">Log in</Link>
        </p>
      </form>
    );
  }

  return <CreateAccount code={invite.code!} legacyName={invite.legacyName ?? null} />;
}

function CreateAccount({ code, legacyName }: { code: string; legacyName: string | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(joinAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className={ui.form}>
      <input type="hidden" name="code" value={code} />
      <div className={ui.stamp}>CODE {code} ✓</div>
      {legacyName && (
        <p className={ui.notice}>
          Welcome back, {legacyName}! Your 2026 season history comes with this account.
        </p>
      )}

      <div className={ui.field}>
        <label htmlFor="username" className={ui.label}>
          Pick a username
        </label>
        <input
          id="username"
          name="username"
          className={ui.input}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={2}
          maxLength={24}
          defaultValue={state.values?.username ?? legacyName ?? ""}
        />
      </div>

      <div className={ui.field}>
        <label htmlFor="password" className={ui.label}>
          Password (at least {PASSWORD_MIN_LENGTH} characters)
        </label>
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          className={ui.input}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
        />
      </div>
      <div className={ui.field}>
        <label htmlFor="confirm" className={ui.label}>
          Password again
        </label>
        <input
          id="confirm"
          name="confirm"
          type={showPassword ? "text" : "password"}
          className={ui.input}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
        />
      </div>
      <label className={ui.check}>
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        Show passwords
      </label>

      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
        {pending ? "SETTING UP…" : "JOIN THE CLUB"}
      </button>
    </form>
  );
}
